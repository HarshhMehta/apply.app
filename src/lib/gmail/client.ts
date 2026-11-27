const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GmailErrorKind =
  | "auth" // 401: token invalid/revoked
  | "quota" // daily sending quota / limit reached: stop until the next day
  | "rate" // short-term rate limit (429): stop and retry later
  | "restricted" // account-level sending restriction
  | "config" // Gmail API not enabled / project misconfigured: stop, fix setup
  | "transient" // 5xx: safe to retry shortly
  | "network" // timeout / DNS / connection reset
  | "permanent"; // 4xx: retrying won't help

export class GmailApiError extends Error {
  constructor(
    message: string,
    public kind: GmailErrorKind,
    public status: number,
    public reason?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

const QUOTA_REASONS = ["dailylimitexceeded", "quotaexceeded", "sendinglimitexceeded", "dailyquotaexceeded"];
const RATE_REASONS = ["ratelimitexceeded", "userratelimitexceeded"];
const RESTRICT_HINTS = ["suspended", "disabled", "restricted", "blocked", "unusual activity", "terms of service", "abuse"];

/** Pure classification of a Gmail API failure. Exported for tests. */
export function classifyGmailError(status: number, reason: string | undefined, message: string): GmailErrorKind {
  const r = (reason ?? "").toLowerCase();
  const m = message.toLowerCase();
  if (status === 401) return "auth";
  if (r === "accessnotconfigured" || /api has not been used|has not been enabled/.test(m)) return "config";
  if (/per minute|per user per|per second/.test(m)) return "rate";
  if (QUOTA_REASONS.includes(r) || /sending limit|daily user sending|daily limit|per day/.test(m)) return "quota";
  if (RESTRICT_HINTS.some((h) => m.includes(h))) return "restricted";
  if (status === 429 || RATE_REASONS.includes(r)) return "rate";
  if (status >= 500) return "transient";
  if (status === 403 && (r === "insufficientpermissions" || /insufficient (authentication scopes|permission)/.test(m))) return "auth";
  return "permanent";
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 15 * 60 * 1000);
  const when = Date.parse(h);
  return Number.isNaN(when) ? undefined : Math.min(Math.max(when - Date.now(), 0), 15 * 60 * 1000);
}

export type SendResult = { id: string; threadId?: string };

/** Calls Gmail users.messages.send. `raw` is the base64url RFC 822 message. */
export async function sendRawMessage(accessToken: string, raw: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new GmailApiError(`Network error while contacting Gmail: ${(err as Error).message}`, "network", 0);
  }

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string };
    if (!data.id) throw new GmailApiError("Gmail returned no message ID", "permanent", res.status);
    return { id: data.id, threadId: data.threadId };
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; errors?: { reason?: string; message?: string }[] };
  };
  const message = body.error?.message || `Gmail API error (${res.status})`;
  const reason = body.error?.errors?.[0]?.reason ?? body.error?.status;
  const kind = classifyGmailError(res.status, reason, message);
  throw new GmailApiError(message, kind, res.status, reason, parseRetryAfter(res.headers.get("retry-after")));
}

/** Human-friendly text for the UI. */
export function describeGmailError(err: GmailApiError): string {
  switch (err.kind) {
    case "auth":
      return "Gmail rejected the credentials. Reconnect your Gmail account.";
    case "config":
      return "The Gmail API is not enabled for your Google Cloud project. Enable it under APIs & Services → Library, then try again.";
    case "quota":
      return "Gmail’s daily sending limit was reached. Sending is paused until tomorrow.";
    case "rate":
      return "Gmail is rate limiting this account. Sending is paused briefly.";
    case "restricted":
      return `Google restricted sending for this account: ${err.message}`;
    case "transient":
      return `Gmail had a temporary problem (${err.status}). ${err.message}`;
    case "network":
      return err.message;
    default:
      return `Gmail refused this message: ${err.message}`;
  }
}
