import { describe, expect, it, vi } from "vitest";
import { GmailApiError, classifyGmailError, describeGmailError, sendRawMessage } from "@/lib/gmail/client";

const resp = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("classifyGmailError", () => {
  it.each([
    [401, undefined, "Invalid Credentials", "auth"],
    [403, "insufficientPermissions", "Insufficient Permission", "auth"],
    [403, "dailyLimitExceeded", "Daily Limit Exceeded", "quota"],
    [429, "rateLimitExceeded", "Daily user sending quota exceeded.", "quota"],
    [429, "rateLimitExceeded", "Rate Limit Exceeded", "rate"],
    [429, "userRateLimitExceeded", "User-rate limit exceeded. Retry after 2026-01-01T00:00:00Z", "rate"],
    [429, undefined, "Quota exceeded for quota metric 'Messages' per minute per user", "rate"],
    [403, "accessNotConfigured", "Gmail API has not been used in project 123 before or it is disabled.", "config"],
    [403, "forbidden", "This account has been suspended", "restricted"],
    [500, "backendError", "Backend Error", "transient"],
    [503, undefined, "Service Unavailable", "transient"],
    [400, "invalidArgument", "Invalid To header", "permanent"],
  ])("%i %s %j -> %s", (status, reason, msg, kind) => {
    expect(classifyGmailError(status, reason, msg)).toBe(kind);
  });
});

describe("sendRawMessage (mocked fetch)", () => {
  it("returns the Gmail message id on success and sends the raw payload with a bearer token", async () => {
    const f = vi.fn().mockResolvedValue(resp(200, { id: "msg123", threadId: "thr9" }));
    const r = await sendRawMessage("tok", "RAW", f as unknown as typeof fetch);
    expect(r).toEqual({ id: "msg123", threadId: "thr9" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ raw: "RAW" });
  });

  it("throws a classified error with Retry-After on 429", async () => {
    const f = vi.fn().mockResolvedValue(resp(429, { error: { message: "Rate Limit Exceeded", errors: [{ reason: "rateLimitExceeded" }] } }, { "retry-after": "30" }));
    const err = (await sendRawMessage("t", "r", f as unknown as typeof fetch).catch((e) => e)) as GmailApiError;
    expect(err).toBeInstanceOf(GmailApiError);
    expect(err.kind).toBe("rate");
    expect(err.retryAfterMs).toBe(30000);
    expect(describeGmailError(err)).toMatch(/rate limiting/);
  });

  it("classifies revoked tokens", async () => {
    const f = vi.fn().mockResolvedValue(resp(401, { error: { message: "Invalid Credentials" } }));
    const err = (await sendRawMessage("t", "r", f as unknown as typeof fetch).catch((e) => e)) as GmailApiError;
    expect(err.kind).toBe("auth");
  });

  it("treats network failures as ambiguous 'network' errors", async () => {
    const f = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const err = (await sendRawMessage("t", "r", f as unknown as typeof fetch).catch((e) => e)) as GmailApiError;
    expect(err.kind).toBe("network");
  });

  it("fails if Gmail returns success without an id", async () => {
    const f = vi.fn().mockResolvedValue(resp(200, {}));
    await expect(sendRawMessage("t", "r", f as unknown as typeof fetch)).rejects.toMatchObject({ kind: "permanent" });
  });
});
