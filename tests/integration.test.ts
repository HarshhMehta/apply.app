/**
 * Integration tests against a real MongoDB (or wire-compatible server) at MONGODB_URI.
 * They are skipped automatically when no database is reachable.
 * Gmail is always mocked: no live Gmail sending is performed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import * as M from "@/models";
import { encrypt } from "@/lib/crypto";
import { saveResumeFile, readResumeFile, deleteResumeFile } from "@/lib/gridfs";
import { createQueueItems, generateDrafts, runBulkAction, updateQueueItem, listHistory, type NewItem } from "@/lib/queue/service";
import { processQueue, recoverStaleSending } from "@/lib/queue/sender";
import { GmailApiError } from "@/lib/gmail/client";
import { GmailAuthError } from "@/lib/gmail/oauth";
import { getDashboardData } from "@/lib/dashboard";
import { rateLimit } from "@/lib/rate-limit";
import { ensureDefaultTemplates } from "@/lib/templates-service";

let dbUp = false;
try {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: "jaa_probe", serverSelectionTimeoutMS: 2500 });
  dbUp = true;
  await mongoose.disconnect();
} catch {
  dbUp = false;
}

let partialSupported = true;
let atomicClaims = true; // false on emulators (FerretDB) whose conditional updates are not atomic
const noSleep = async () => undefined;
const item = (email: string, over: Partial<NewItem> = {}): NewItem => ({ recipientEmail: email, category: "frontend", subject: `Hi ${email}`, body: "Body text", ...over });
const tokenOk = async () => ({ token: "tok", email: "me@gmail.com" });

describe.skipIf(!dbUp)("database integration", () => {
  let userId: Types.ObjectId;

  beforeAll(async () => {
    await connectDB();
    await mongoose.connection.dropDatabase();
    const info = await mongoose.connection.db!.admin().command({ buildInfo: 1 });
    atomicClaims = !("ferretdbVersion" in info);
    // Real MongoDB supports partial indexes. Some compatible servers (e.g. FerretDB) don't, so fall back gracefully.
    for (const m of Object.values(M) as mongoose.Model<unknown>[]) {
      try {
        await m.syncIndexes();
      } catch {
        partialSupported = false;
        for (const [fields, opts] of m.schema.indexes()) {
          const { partialFilterExpression: _p, expireAfterSeconds: _e, ...rest } = (opts ?? {}) as Record<string, unknown>;
          if (_p) continue;
          await m.collection.createIndex(fields as never, rest as never);
        }
      }
    }
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    const u = await M.User.create({ email: `u${Date.now()}${Math.random()}@x.com`, passwordHash: "x" });
    userId = u._id;
    await M.GmailConnection.create({ userId, googleEmail: "me@gmail.com", encRefreshToken: encrypt("rt"), status: "connected" });
  });

  async function approveAll(emails: string[]) {
    const q = await M.EmailQueue.find({ userId, recipientEmail: { $in: emails } }).lean();
    return runBulkAction(userId, q.map((x) => String(x._id)), "approve");
  }

  describe("queue creation & duplicates", () => {
    it("creates pending items and an application per recipient", async () => {
      const r = await createQueueItems(userId, [item("A@Acme.com"), item("b@acme.com")], "pending_review");
      expect(r.created).toHaveLength(2);
      const apps = await M.Application.find({ userId }).lean();
      expect(apps.map((a) => a.recipientEmail).sort()).toEqual(["a@acme.com", "b@acme.com"]);
      expect(apps.every((a) => a.status === "pending_review")).toBe(true);
    });

    it("skips duplicates within one batch and invalid emails", async () => {
      const r = await createQueueItems(userId, [item("a@acme.com"), item("A@acme.com"), item("nope")], "pending_review");
      expect(r.created).toHaveLength(1);
      expect(r.skipped.map((s) => s.reason)).toEqual(["Duplicate in this batch", "Not a valid email address"]);
    });

    it("refuses to re-apply to a recipient that is queued or sent", async () => {
      await createQueueItems(userId, [item("a@acme.com")], "pending_review");
      const again = await createQueueItems(userId, [item("a@acme.com")], "pending_review");
      expect(again.created).toHaveLength(0);
      expect(again.skipped[0].reason).toMatch(/Already/);
      expect(await M.EmailQueue.countDocuments({ userId })).toBe(1);
    });

    it("allows re-applying after rejection and replaces the old entry", async () => {
      await createQueueItems(userId, [item("a@acme.com")], "pending_review");
      const q = await M.EmailQueue.findOne({ userId }).lean();
      await runBulkAction(userId, [String(q!._id)], "reject");
      const r = await createQueueItems(userId, [item("a@acme.com", { subject: "Second try" })], "pending_review");
      expect(r.created).toHaveLength(1);
      expect(await M.EmailQueue.countDocuments({ userId })).toBe(1);
      expect((await M.Application.findOne({ userId }).lean())!.subject).toBe("Second try");
    });

    it("rejects a resume belonging to someone else", async () => {
      const other = await M.User.create({ email: `o${Math.random()}@x.com`, passwordHash: "x" });
      const foreign = await M.Resume.create({ userId: other._id, name: "theirs", originalFilename: "t.pdf", gridFsId: new Types.ObjectId(), size: 5, sha256: "h" });
      const r = await createQueueItems(userId, [item("a@acme.com", { resumeId: String(foreign._id) })], "pending_review");
      expect(r.created).toHaveLength(0);
      expect(r.skipped[0].reason).toMatch(/resume/i);
    });
  });

  describe("status transitions", () => {
    it("only pending items can be approved; drafts must be submitted first", async () => {
      await createQueueItems(userId, [item("draft@a.com")], "draft");
      await createQueueItems(userId, [item("pend@a.com")], "pending_review");
      const all = await M.EmailQueue.find({ userId }).lean();
      const r = await runBulkAction(userId, all.map((x) => String(x._id)), "approve");
      expect(r.done).toHaveLength(1);
      expect(r.skipped[0].email).toBe("draft@a.com");
      expect((await M.Application.findOne({ userId, recipientEmail: "pend@a.com" }).lean())!.status).toBe("approved");
    });

    it("blocks editing approved emails and deleting sent ones", async () => {
      await createQueueItems(userId, [item("a@a.com")], "pending_review");
      await approveAll(["a@a.com"]);
      const q = (await M.EmailQueue.findOne({ userId }))!;
      await expect(updateQueueItem(userId, q._id, { subject: "x" })).rejects.toMatchObject({ status: 409 });
      await M.EmailQueue.updateOne({ _id: q._id }, { status: "sent" });
      const del = await runBulkAction(userId, [String(q._id)], "delete");
      expect(del.done).toHaveLength(0);
      expect(del.skipped[0].reason).toMatch(/history/);
    });

    it("editing the recipient updates the application and blocks collisions", async () => {
      await createQueueItems(userId, [item("a@a.com"), item("b@a.com")], "pending_review");
      const a = (await M.EmailQueue.findOne({ userId, recipientEmail: "a@a.com" }))!;
      await expect(updateQueueItem(userId, a._id, { recipientEmail: "b@a.com" })).rejects.toMatchObject({ status: 409 });
      await updateQueueItem(userId, a._id, { recipientEmail: "c@a.com", subject: "New subject" });
      const app = await M.Application.findOne({ userId, recipientEmail: "c@a.com" }).lean();
      expect(app?.subject).toBe("New subject");
    });
  });

  describe("sender (mocked Gmail)", () => {
    it("sends only approved emails, stores message id and time, and never sends twice", async () => {
      await createQueueItems(userId, [item("go@a.com"), item("wait@a.com")], "pending_review");
      await approveAll(["go@a.com"]);
      const sendFn = vi.fn().mockResolvedValue({ id: "gmail-1", threadId: "t-1" });
      const r1 = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(r1).toMatchObject({ sent: 1, failed: 0, stopReason: "idle" });
      const r2 = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(r2.sent).toBe(0);
      expect(sendFn).toHaveBeenCalledTimes(1);

      const sent = (await M.EmailQueue.findOne({ userId, recipientEmail: "go@a.com" }).lean())!;
      expect(sent).toMatchObject({ status: "sent", gmailMessageId: "gmail-1", attempts: 1 });
      expect(sent.sentAt).toBeInstanceOf(Date);
      expect((await M.EmailQueue.findOne({ userId, recipientEmail: "wait@a.com" }).lean())!.status).toBe("pending_review");
      const app = await M.Application.findOne({ userId, recipientEmail: "go@a.com" }).lean();
      expect(app).toMatchObject({ status: "sent", gmailMessageId: "gmail-1" });
    });

    it("attaches the selected resume from GridFS and builds a valid MIME message", async () => {
      const pdf = Buffer.from("%PDF-1.4 resume bytes here");
      const gridFsId = await saveResumeFile("cv.pdf", pdf, {});
      expect((await readResumeFile(gridFsId)).equals(pdf)).toBe(true);
      const resume = await M.Resume.create({ userId, name: "My CV", originalFilename: "cv.pdf", gridFsId, size: pdf.length, sha256: "abc" });
      await createQueueItems(userId, [item("cv@a.com", { resumeId: String(resume._id) })], "pending_review");
      await approveAll(["cv@a.com"]);
      let raw = "";
      const sendFn = vi.fn(async (_t: string, r: string) => { raw = r; return { id: "m1" }; });
      await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      const mime = Buffer.from(raw, "base64url").toString();
      expect(mime).toContain("To: cv@a.com");
      expect(mime).toContain('filename="My CV.pdf"');
      expect(mime).toContain(pdf.toString("base64"));
      await deleteResumeFile(gridFsId);
      await expect(readResumeFile(gridFsId)).rejects.toThrow();
    });

    it("enforces the daily cap", async () => {
      await M.AppSettings.create({ userId, dailyCap: 2 });
      await createQueueItems(userId, ["1", "2", "3"].map((n) => item(`n${n}@a.com`)), "pending_review");
      await approveAll(["n1@a.com", "n2@a.com", "n3@a.com"]);
      const sendFn = vi.fn().mockImplementation(async () => ({ id: `id-${Math.random()}` }));
      const r = await processQueue(userId, { maxItems: 10 }, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(r).toMatchObject({ sent: 2, stopReason: "cap", remaining: 1 });
      expect(sendFn).toHaveBeenCalledTimes(2);
      expect(await M.EmailQueue.countDocuments({ userId, status: "approved" })).toBe(1);
    });

    it("retries transient errors and then succeeds once", async () => {
      await createQueueItems(userId, [item("t@a.com")], "pending_review");
      await approveAll(["t@a.com"]);
      const sendFn = vi.fn()
        .mockRejectedValueOnce(new GmailApiError("Backend Error", "transient", 503))
        .mockRejectedValueOnce(new GmailApiError("Backend Error", "transient", 500))
        .mockResolvedValueOnce({ id: "ok-after-retry" });
      const sleepFn = vi.fn(noSleep);
      const r = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn });
      expect(r.sent).toBe(1);
      expect(sendFn).toHaveBeenCalledTimes(3);
      expect(sleepFn).toHaveBeenCalled();
    });

    it("fails permanently after retries are exhausted without looping forever", async () => {
      await M.AppSettings.create({ userId, maxRetries: 2 });
      await createQueueItems(userId, [item("t@a.com")], "pending_review");
      await approveAll(["t@a.com"]);
      const sendFn = vi.fn().mockRejectedValue(new GmailApiError("down", "transient", 503));
      const r = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(sendFn).toHaveBeenCalledTimes(3);
      expect(r.failed).toBe(1);
      const q = (await M.EmailQueue.findOne({ userId }).lean())!;
      expect(q.status).toBe("failed");
      expect(q.errorCode).toBe("TRANSIENT");
    });

    it("marks permanent rejections failed and continues with the next email", async () => {
      await createQueueItems(userId, [item("bad@a.com"), item("good@a.com")], "pending_review");
      await approveAll(["bad@a.com", "good@a.com"]);
      const sendFn = vi.fn()
        .mockRejectedValueOnce(new GmailApiError("Invalid To header", "permanent", 400))
        .mockResolvedValueOnce({ id: "g1" });
      const r = await processQueue(userId, { maxItems: 5 }, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(r).toMatchObject({ sent: 1, failed: 1 });
      expect((await M.EmailQueue.findOne({ userId, recipientEmail: "bad@a.com" }).lean())!.lastError).toMatch(/Invalid To header/);
    });

    it("stops and pauses on a Gmail quota error, keeping the email approved", async () => {
      await createQueueItems(userId, [item("q1@a.com"), item("q2@a.com")], "pending_review");
      await approveAll(["q1@a.com", "q2@a.com"]);
      const sendFn = vi.fn().mockRejectedValue(new GmailApiError("Daily user sending quota exceeded.", "quota", 429, "rateLimitExceeded"));
      const r = await processQueue(userId, { maxItems: 5 }, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(r.stopReason).toBe("blocked");
      expect(r.blockedUntil).toBeTruthy();
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(await M.EmailQueue.countDocuments({ userId, status: "approved" })).toBe(2);
      expect((await M.EmailQueue.findOne({ userId, recipientEmail: "q1@a.com" }).lean())!.attempts).toBe(0);
      const again = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(again.stopReason).toBe("blocked");
      expect(sendFn).toHaveBeenCalledTimes(1);
    });

    it("pauses on 429 rate limits", async () => {
      await createQueueItems(userId, [item("r@a.com")], "pending_review");
      await approveAll(["r@a.com"]);
      const sendFn = vi.fn().mockRejectedValue(new GmailApiError("Rate Limit Exceeded", "rate", 429, "rateLimitExceeded", 30000));
      const r = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(r.stopReason).toBe("blocked");
      const s = (await M.AppSettings.findOne({ userId }).lean())!;
      expect(s.blockedUntil!.getTime()).toBeGreaterThan(Date.now() + 50_000);
    });

    it("flags the connection as revoked on 401 and keeps the email queued", async () => {
      await createQueueItems(userId, [item("x@a.com")], "pending_review");
      await approveAll(["x@a.com"]);
      const sendFn = vi.fn().mockRejectedValue(new GmailApiError("Invalid Credentials", "auth", 401));
      const r = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(r.stopReason).toBe("auth");
      expect((await M.GmailConnection.findOne({ userId }).lean())!.status).toBe("revoked");
      expect((await M.EmailQueue.findOne({ userId }).lean())!.status).toBe("approved");
      const next = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(next.stopReason).toBe("not_connected");
    });

    it("handles refresh-token revocation raised while fetching the access token", async () => {
      await createQueueItems(userId, [item("x@a.com")], "pending_review");
      await approveAll(["x@a.com"]);
      const tokenFn = vi.fn().mockRejectedValue(new GmailAuthError("Google access was revoked", "revoked"));
      const sendFn = vi.fn();
      const r = await processQueue(userId, {}, { sendFn, tokenFn, sleepFn: noSleep });
      expect(r.stopReason).toBe("auth");
      expect(sendFn).not.toHaveBeenCalled();
      expect((await M.EmailQueue.findOne({ userId }).lean())!.status).toBe("approved");
    });

    it("does not retry ambiguous network failures (possible duplicate send)", async () => {
      await createQueueItems(userId, [item("n@a.com")], "pending_review");
      await approveAll(["n@a.com"]);
      const sendFn = vi.fn().mockRejectedValue(new GmailApiError("socket hang up", "network", 0));
      const r = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(sendFn).toHaveBeenCalledTimes(1);
      expect(r.failed).toBe(1);
      expect((await M.EmailQueue.findOne({ userId }).lean())!.errorCode).toBe("UNKNOWN_OUTCOME");
    });

    it("two concurrent workers never send the same email twice (needs real MongoDB)", async () => {
      if (!atomicClaims) return console.warn("skipped: FerretDB does not provide atomic conditional updates; run against real MongoDB");
      await createQueueItems(userId, ["a", "b", "c", "d"].map((n) => item(`${n}@c.com`)), "pending_review");
      await approveAll(["a@c.com", "b@c.com", "c@c.com", "d@c.com"]);
      const sent: string[] = [];
      const sendFn = vi.fn(async () => { await new Promise((r) => setTimeout(r, 15)); const id = `m-${sent.length}`; sent.push(id); return { id }; });
      await Promise.all([1, 2, 3].map(() => processQueue(userId, { maxItems: 10 }, { sendFn, tokenFn: tokenOk, sleepFn: noSleep })));
      expect(sendFn).toHaveBeenCalledTimes(4);
      expect(await M.EmailQueue.countDocuments({ userId, status: "sent" })).toBe(4);
    });

    it("never touches items that are not approved", async () => {
      await createQueueItems(userId, [item("d@a.com")], "draft");
      await createQueueItems(userId, [item("p@a.com")], "pending_review");
      const sendFn = vi.fn();
      const r = await processQueue(userId, {}, { sendFn, tokenFn: tokenOk, sleepFn: noSleep });
      expect(sendFn).not.toHaveBeenCalled();
      expect(r.stopReason).toBe("idle");
    });

    it("recovers stale 'sending' items as unknown-outcome failures instead of re-sending", async () => {
      await createQueueItems(userId, [item("s@a.com")], "pending_review");
      await approveAll(["s@a.com"]);
      await M.EmailQueue.updateOne({ userId }, { status: "sending", sendingStartedAt: new Date(Date.now() - 10 * 60_000) });
      expect(await recoverStaleSending(userId, new Date())).toBe(1);
      const q = (await M.EmailQueue.findOne({ userId }).lean())!;
      expect(q).toMatchObject({ status: "failed", errorCode: "UNKNOWN_OUTCOME" });
    });
  });

  describe("drafts, history, dashboard, limits", () => {
    it("renders default templates with and without company/recruiter, using profile data only", async () => {
      await ensureDefaultTemplates(userId);
      await M.CandidateProfile.create({ userId, candidateName: "Asha Rao", primarySkills: ["React", "Node"] });
      const t = (await M.EmailTemplate.findOne({ userId, category: "frontend", isDefault: true }).lean())!;
      const res = await generateDrafts(userId, { templateId: String(t._id), recipients: [{ email: "a@x.com" }, { email: "b@x.com", companyName: "Acme", recruiterName: "Sam" }] });
      expect(res.drafts[0].body).toContain("Dear Hiring Manager,");
      expect(res.drafts[0].body).not.toContain("Acme");
      expect(res.drafts[0].subject).toBe("Application for Frontend Developer – Asha Rao");
      expect(res.drafts[1].body).toContain("Dear Sam,");
      expect(res.drafts[1].subject).toContain("at Acme");
      expect(res.drafts[0].body).toContain("React, Node");
    });

    it("keeps one default template per category (needs partial-index support)", async () => {
      if (!partialSupported) return console.warn("skipped: server lacks partial indexes (real MongoDB has them)");
      await ensureDefaultTemplates(userId);
      await expect(M.EmailTemplate.create({ userId, name: "dup", category: "frontend", subject: "s", body: "b", isDefault: true })).rejects.toMatchObject({ code: 11000 });
    });

    it("filters history by status, category, search and date, with pagination", async () => {
      await createQueueItems(userId, [item("a@a.com"), item("b@a.com", { category: "backend" }), item("c@a.com")], "pending_review");
      await M.Application.updateOne({ userId, recipientEmail: "a@a.com" }, { status: "sent" });
      const base = { page: 1, pageSize: 2 };
      expect((await listHistory(userId, { ...base })).total).toBe(3);
      expect((await listHistory(userId, { ...base })).items).toHaveLength(2);
      expect((await listHistory(userId, { ...base, status: "sent" })).total).toBe(1);
      expect((await listHistory(userId, { ...base, category: "backend" })).total).toBe(1);
      expect((await listHistory(userId, { ...base, search: "C@A." })).total).toBe(1);
      const today = new Date().toISOString().slice(0, 10);
      expect((await listHistory(userId, { ...base, from: today, to: today })).total).toBe(3);
      expect((await listHistory(userId, { ...base, from: "2000-01-01", to: "2000-01-02" })).total).toBe(0);
      expect((await listHistory(userId, { ...base, search: ".*" })).total).toBe(0); // regex input is escaped
    });

    it("computes dashboard totals", async () => {
      await createQueueItems(userId, [item("a@a.com"), item("b@a.com"), item("c@a.com")], "pending_review");
      await createQueueItems(userId, [item("d@a.com")], "draft");
      await approveAll(["a@a.com"]);
      await processQueue(userId, {}, { sendFn: async () => ({ id: "z" }), tokenFn: tokenOk, sleepFn: noSleep });
      const d = await getDashboardData(userId);
      expect(d.totals).toMatchObject({ total: 4, sent: 1, pendingReview: 2, draft: 1, failed: 0, today: 1 });
      expect(d.series.reduce((a, b) => a + b.count, 0)).toBe(1);
      expect(d.gmail?.email).toBe("me@gmail.com");
    });

    it("rate limiter blocks after the limit within a window", async () => {
      const key = `test:${Math.random()}`;
      for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60);
      await expect(rateLimit(key, 3, 60)).rejects.toMatchObject({ status: 429 });
    });
  });
});
