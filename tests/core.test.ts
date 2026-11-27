import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { dayBounds, tzOffsetMs } from "@/lib/limits";
import { ACTIONS, TRANSITIONS, canTransition } from "@/lib/queue/status";
import { STATUSES } from "@/lib/constants";
import { bulkSchema, profileSchema, queueCreateSchema, settingsSchema, templateSchema } from "@/lib/validators";
import { validatePdf } from "@/lib/pdf";
import { ApiError, assertSameOrigin, errorResponse } from "@/lib/http";
import { NextRequest } from "next/server";

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("1//refresh-token");
    const b = encrypt("1//refresh-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh-token");
    expect(decrypt(a)).toBe("1//refresh-token");
  });
  it("detects tampering", () => {
    const parts = encrypt("secret").split(".");
    parts[3] = Buffer.from("tampered!").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});

describe("daily window", () => {
  it("computes the local day in a timezone", () => {
    const now = new Date("2026-03-10T20:00:00Z"); // 01:30 on the 11th in Kolkata
    const { start, end } = dayBounds("Asia/Kolkata", now);
    expect(start.toISOString()).toBe("2026-03-10T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-03-11T18:30:00.000Z");
    expect(tzOffsetMs(now, "Asia/Kolkata")).toBe(5.5 * 3600 * 1000);
  });
  it("handles DST days (23h/25h)", () => {
    const { start, end } = dayBounds("America/New_York", new Date("2026-03-08T18:00:00Z"));
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);
  });
  it("falls back to UTC for invalid zones", () => {
    const { start } = dayBounds("Nope/Zone", new Date("2026-01-05T10:00:00Z"));
    expect(start.toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });
});

describe("status transitions", () => {
  it("sent is terminal", () => {
    for (const s of STATUSES) expect(canTransition("sent", s)).toBe(false);
  });
  it("never allows sending without approval", () => {
    expect(canTransition("pending_review", "sending")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("draft", "sent")).toBe(false);
    expect(canTransition("approved", "sending")).toBe(true);
    expect(canTransition("pending_review", "approved")).toBe(true);
  });
  it("only pending reviews can be approved, and failed ones retried", () => {
    expect(ACTIONS.approve.from).toEqual(["pending_review"]);
    expect(ACTIONS.retry.from).toEqual(["failed"]);
    for (const a of Object.values(ACTIONS)) for (const f of a.from) expect(TRANSITIONS[f]).toContain(a.to);
  });
});

describe("zod validation", () => {
  it("rejects bad templates", () => {
    expect(templateSchema.safeParse({ name: "", category: "frontend", subject: "s", body: "b" }).success).toBe(false);
    expect(templateSchema.safeParse({ name: "n", category: "nope", subject: "s", body: "b" }).success).toBe(false);
    expect(templateSchema.safeParse({ name: "n", category: "backend", subject: "multi\nline", body: "b" }).success).toBe(false);
    expect(templateSchema.safeParse({ name: "n", category: "backend", subject: "ok", body: "b" }).success).toBe(true);
  });
  it("validates queue items and batch limits", () => {
    const item = { recipientEmail: "hr@acme.com", category: "frontend", subject: "S", body: "B" };
    expect(queueCreateSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(queueCreateSchema.safeParse({ items: [{ ...item, recipientEmail: "bad" }] }).success).toBe(false);
    expect(queueCreateSchema.safeParse({ items: [] }).success).toBe(false);
    expect(queueCreateSchema.safeParse({ items: [{ ...item, resumeId: "not-an-id" }] }).success).toBe(false);
  });
  it("validates bulk actions and ids", () => {
    expect(bulkSchema.safeParse({ ids: ["a".repeat(24)], action: "approve" }).success).toBe(true);
    expect(bulkSchema.safeParse({ ids: ["x"], action: "approve" }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: ["a".repeat(24)], action: "send" }).success).toBe(false);
  });
  it("validates profile URLs and settings bounds", () => {
    expect(profileSchema.safeParse({ portfolioUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(profileSchema.safeParse({ portfolioUrl: "https://me.dev" }).success).toBe(true);
    expect(profileSchema.parse({}).primarySkills).toEqual([]);
    expect(settingsSchema.safeParse({ dailyCap: 0, sendIntervalMs: 2000, maxRetries: 3, timezone: "UTC" }).success).toBe(false);
    expect(settingsSchema.safeParse({ dailyCap: 100, sendIntervalMs: 2000, maxRetries: 3, timezone: "Mars/Base" }).success).toBe(false);
    expect(settingsSchema.safeParse({ dailyCap: 100, sendIntervalMs: 2000, maxRetries: 3, timezone: "Asia/Kolkata" }).success).toBe(true);
  });
});

describe("PDF upload validation", () => {
  const pdfHead = Buffer.from("%PDF-1.7\n...");
  it("accepts a real PDF", () => expect(() => validatePdf({ name: "cv.pdf", size: 1000 }, pdfHead)).not.toThrow());
  it("rejects wrong extension, fake content, empty and oversized files", () => {
    expect(() => validatePdf({ name: "cv.docx", size: 1000 }, pdfHead)).toThrow(/PDF/);
    expect(() => validatePdf({ name: "cv.pdf", size: 1000 }, Buffer.from("MZ executable"))).toThrow(/valid PDF/);
    expect(() => validatePdf({ name: "cv.pdf", size: 0 }, pdfHead)).toThrow(/empty/);
    expect(() => validatePdf({ name: "cv.pdf", size: 50 * 1024 * 1024 }, pdfHead)).toThrow(/too large/);
  });
});

describe("CSRF origin check", () => {
  const mk = (method: string, headers: Record<string, string>) => new NextRequest("http://localhost:3000/api/x", { method, headers });
  it("allows same-origin mutations and all GETs", () => {
    expect(() => assertSameOrigin(mk("POST", { origin: "http://localhost:3000" }))).not.toThrow();
    expect(() => assertSameOrigin(mk("POST", { "sec-fetch-site": "same-origin" }))).not.toThrow();
    expect(() => assertSameOrigin(mk("GET", { origin: "https://evil.example" }))).not.toThrow();
  });
  it("blocks cross-origin or origin-less mutations", () => {
    expect(() => assertSameOrigin(mk("POST", { origin: "https://evil.example" }))).toThrow(ApiError);
    expect(() => assertSameOrigin(mk("DELETE", {}))).toThrow(ApiError);
  });
});

describe("error responses", () => {
  it("maps zod errors to 400 with field details and hides internals on 500", async () => {
    const z = templateSchema.safeParse({});
    const res = errorResponse(z.error);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    const r2 = errorResponse(new Error("secret stack detail"));
    expect(r2.status).toBe(500);
    expect(JSON.stringify(await r2.json())).not.toContain("secret stack detail");
  });
  it("maps duplicate key errors to 409", () => expect(errorResponse({ code: 11000 }).status).toBe(409));
});
