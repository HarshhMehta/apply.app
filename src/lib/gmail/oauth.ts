import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
// gmail.send is the narrowest scope that allows sending. `openid email` only reveals which address was connected.
export const OAUTH_SCOPES = ["openid", "email", GMAIL_SEND_SCOPE];

export const OAUTH_COOKIE = "jaa_oauth";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export class GmailAuthError extends Error {
  constructor(
    message: string,
    public kind: "revoked" | "config" | "denied" | "failed" = "failed",
  ) {
    super(message);
  }
}

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function buildAuthUrl(state: string, codeVerifier: string): string {
  const e = env();
  const p = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: e.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    access_type: "offline", // needed to receive a refresh token
    prompt: "consent", // ensures a refresh token is issued on re-connect
    include_granted_scopes: "false",
    state,
    code_challenge: pkceChallenge(codeVerifier),
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GmailAuthError("Could not reach Google to complete authorization. Check your connection and try again.", "failed");
  }
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) {
    if (data.error === "invalid_grant") {
      throw new GmailAuthError("Google access was revoked or has expired. Reconnect your Gmail account.", "revoked");
    }
    if (data.error === "invalid_client" || data.error === "unauthorized_client") {
      throw new GmailAuthError("Google rejected the OAuth client. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.", "config");
    }
    throw new GmailAuthError(`Google token request failed: ${data.error_description || data.error || res.status}`, "failed");
  }
  return data;
}

export function decodeIdToken(idToken: string): { email?: string; email_verified?: boolean; sub?: string } {
  // Received directly from Google's token endpoint over TLS, so we only read the claims.
  const part = idToken.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export async function exchangeCode(code: string, codeVerifier: string) {
  const e = env();
  const t = await postToken({
    code,
    client_id: e.GOOGLE_CLIENT_ID,
    client_secret: e.GOOGLE_CLIENT_SECRET,
    redirect_uri: e.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const scopes = (t.scope ?? "").split(" ").filter(Boolean);
  if (!scopes.includes(GMAIL_SEND_SCOPE)) {
    throw new GmailAuthError("The Gmail send permission was not granted. Connect again and allow “Send email on your behalf”.", "denied");
  }
  if (!t.refresh_token) {
    throw new GmailAuthError("Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.", "failed");
  }
  const claims = t.id_token ? decodeIdToken(t.id_token) : {};
  if (!claims.email) throw new GmailAuthError("Google did not return the account email address.", "failed");
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scopes,
    email: claims.email.toLowerCase(),
    sub: claims.sub,
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const e = env();
  const t = await postToken({
    client_id: e.GOOGLE_CLIENT_ID,
    client_secret: e.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Best effort: the local record is removed regardless.
  }
}
