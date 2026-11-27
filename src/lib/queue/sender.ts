import { Types } from "mongoose";
import { EmailQueue } from "@/models/EmailQueue";
import { Application } from "@/models/Application";
import { AppSettings } from "@/models/AppSettings";
import { Resume } from "@/models/Resume";
import { CandidateProfile } from "@/models/CandidateProfile";
import { GmailConnection } from "@/models/GmailConnection";
import { readResumeFile } from "@/lib/gridfs";
import { buildMimeMessage, formatAddress, toGmailRaw } from "@/lib/email/mime";
import { GmailApiError, describeGmailError, sendRawMessage, type SendResult } from "@/lib/gmail/client";
import { GmailAuthError } from "@/lib/gmail/oauth";
import { getAccessToken, markConnection } from "@/lib/gmail/service";
import { dayBounds, getDailyUsage, getOrCreateSettings } from "@/lib/limits";
import { sleep } from "@/lib/utils";

export const STALE_SENDING_MS = 3 * 60 * 1000;
const MAX_BACKOFF_MS = 8000;

export type StopReason = "idle" | "cap" | "blocked" | "not_connected" | "auth" | "config" | "time" | "limit";

export type ProcessResult = {
  processed: number;
  sent: number;
  failed: number;
  remaining: number;
  usage: { used: number; cap: number };
  stopReason: StopReason;
  message?: string;
  blockedUntil?: string;
};

export type SenderDeps = {
  sendFn?: (accessToken: string, raw: string) => Promise<SendResult>;
  tokenFn?: (userId: Types.ObjectId) => Promise<{ token: string; email: string }>;
  sleepFn?: (ms: number) => Promise<void>;
  now?: () => Date;
};

/**
 * Sends approved emails one at a time. Designed to be called repeatedly (e.g. by the UI) so it works on
 * serverless hosts: each call handles a small, time-boxed slice and reports progress.
 *
 * Safety rules:
 *  - An item is claimed with an atomic approved→sending update, so two callers can never send the same email.
 *  - `sent` is terminal; a sent item is never picked up again.
 *  - Only clearly-transient 5xx/429-style failures are retried automatically. Network timeouts are ambiguous
 *    (Gmail may have accepted the message), so they are NOT retried; the item is failed for manual review.
 *  - Quota, rate-limit, restriction, auth and config errors stop the run and put the item back to `approved`.
 */
export async function processQueue(
  userId: Types.ObjectId,
  opts: { maxItems?: number; budgetMs?: number } = {},
  deps: SenderDeps = {},
): Promise<ProcessResult> {
  const now = deps.now ?? (() => new Date());
  const nap = deps.sleepFn ?? sleep;
  const started = Date.now();
  const maxItems = opts.maxItems ?? 5;
  const budgetMs = opts.budgetMs ?? 40_000;

  const settings = await getOrCreateSettings(userId);
  const result: ProcessResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    remaining: 0,
    usage: { used: 0, cap: settings.dailyCap },
    stopReason: "idle",
  };

  await recoverStaleSending(userId, now());

  const finish = async (reason: StopReason, message?: string, blockedUntil?: Date | null) => {
    result.stopReason = reason;
    if (message) result.message = message;
    if (blockedUntil) result.blockedUntil = blockedUntil.toISOString();
    result.remaining = await EmailQueue.countDocuments({ userId, status: { $in: ["approved", "sending"] } });
    result.usage = { used: (await getDailyUsage(userId, settings.timezone, now())).used, cap: settings.dailyCap };
    return result;
  };

  while (result.processed < maxItems) {
    if (Date.now() - started > budgetMs) return finish("time");

    const fresh = await AppSettings.findOne({ userId }).lean();
    if (fresh?.blockedUntil && fresh.blockedUntil > now()) {
      return finish("blocked", fresh.blockedReason ?? "Sending is paused.", fresh.blockedUntil);
    }

    const { used } = await getDailyUsage(userId, settings.timezone, now());
    if (used >= settings.dailyCap) {
      return finish("cap", `Daily limit of ${settings.dailyCap} emails reached. Approved emails will wait until tomorrow or until you raise the limit in Settings.`);
    }

    const conn = await GmailConnection.findOne({ userId }).select("status").lean();
    if (!conn || conn.status !== "connected") {
      return finish("not_connected", conn ? "Gmail access was revoked. Reconnect Gmail to continue." : "Connect a Gmail account before sending.");
    }

    // Atomic claim: approved → sending.
    const item = await EmailQueue.findOneAndUpdate(
      { userId, status: "approved", gmailMessageId: null },
      { $set: { status: "sending", sendingStartedAt: now() }, $inc: { attempts: 1 } },
      { sort: { approvedAt: 1, _id: 1 }, returnDocument: "after" },
    );
    if (!item) return finish("idle");
    await Application.updateOne({ _id: item.applicationId, userId }, { $set: { status: "sending" } });

    const outcome = await sendOne(userId, item._id, settings.maxRetries, deps, now, nap);
    result.processed++;

    if (outcome.type === "sent") result.sent++;
    else if (outcome.type === "failed") result.failed++;
    else if (outcome.type === "stop") {
      return finish(outcome.reason, outcome.message, outcome.blockedUntil);
    }

    // Space out sends; don't hammer Gmail.
    const more = await EmailQueue.exists({ userId, status: "approved" });
    if (more && result.processed < maxItems) await nap(settings.sendIntervalMs);
  }
  return finish(result.processed >= maxItems ? "limit" : "idle");
}

type Outcome =
  | { type: "sent" }
  | { type: "failed" }
  | { type: "stop"; reason: StopReason; message: string; blockedUntil?: Date };

async function sendOne(
  userId: Types.ObjectId,
  itemId: Types.ObjectId,
  maxRetries: number,
  deps: SenderDeps,
  now: () => Date,
  nap: (ms: number) => Promise<void>,
): Promise<Outcome> {
  const item = await EmailQueue.findOne({ _id: itemId, userId });
  if (!item || item.status !== "sending") return { type: "failed" };

  const fail = async (code: string, message: string): Promise<Outcome> => {
    await EmailQueue.updateOne({ _id: item._id, status: "sending" }, { $set: { status: "failed", lastError: message, errorCode: code } });
    await Application.updateOne({ _id: item.applicationId, userId }, { $set: { status: "failed" } });
    return { type: "failed" };
  };
  /** Return the item to the queue untouched (not the user's fault, nothing was sent). */
  const requeue = async () => {
    await EmailQueue.updateOne({ _id: item._id, status: "sending" }, { $set: { status: "approved" }, $inc: { attempts: -1 }, $unset: { sendingStartedAt: 1 } });
    await Application.updateOne({ _id: item.applicationId, userId }, { $set: { status: "approved" } });
  };

  try {
    const attachments = [];
    if (item.resumeId) {
      const resume = await Resume.findOne({ _id: item.resumeId, userId }).lean();
      if (!resume) return fail("RESUME_MISSING", "The selected resume no longer exists. Choose another resume and retry.");
      const content = await readResumeFile(resume.gridFsId);
      const base = resume.name.replace(/\.pdf$/i, "").replace(/[^\w .()-]+/g, "_").trim() || "Resume";
      attachments.push({ filename: `${base}.pdf`, contentType: "application/pdf", content });
    }

    const profile = await CandidateProfile.findOne({ userId }).select("candidateName").lean();
    let access: { token: string; email: string };
    try {
      access = await (deps.tokenFn ?? getAccessToken)(userId);
    } catch (err) {
      if (err instanceof GmailAuthError) {
        await requeue();
        return { type: "stop", reason: err.kind === "config" ? "config" : "auth", message: err.message };
      }
      throw err;
    }

    const raw = toGmailRaw(
      buildMimeMessage({
        from: formatAddress(profile?.candidateName, access.email),
        to: item.recipientEmail,
        subject: item.subject,
        text: item.body,
        attachments,
        messageIdDomain: access.email.split("@")[1],
        date: now(),
      }),
    );

    const send = deps.sendFn ?? sendRawMessage;
    let attempt = 0;
    for (;;) {
      try {
        const sent = await send(access.token, raw);
        await persistSuccess(userId, item._id, item.applicationId, sent, now());
        return { type: "sent" };
      } catch (err) {
        if (!(err instanceof GmailApiError)) throw err;
        if (err.kind === "transient" && attempt < maxRetries) {
          await nap(Math.min(err.retryAfterMs ?? 1000 * 2 ** attempt, MAX_BACKOFF_MS));
          attempt++;
          continue;
        }
        return await handleSendError(userId, err, { requeue, fail, now });
      }
    }
  } catch (err) {
    console.error("[sender] unexpected error", err);
    return fail("INTERNAL", `Unexpected error while sending: ${(err as Error).message}`);
  }
}

async function persistSuccess(userId: Types.ObjectId, itemId: Types.ObjectId, applicationId: Types.ObjectId, sent: SendResult, at: Date) {
  // The email is already out; make sure the record reflects that even if the DB hiccups.
  for (let i = 0; i < 4; i++) {
    try {
      await EmailQueue.updateOne(
        { _id: itemId, status: "sending" },
        { $set: { status: "sent", gmailMessageId: sent.id, gmailThreadId: sent.threadId ?? null, sentAt: at, lastError: null, errorCode: null } },
      );
      await Application.updateOne({ _id: applicationId, userId }, { $set: { status: "sent", gmailMessageId: sent.id, appliedAt: at } });
      return;
    } catch (err) {
      if (i === 3) throw err;
      await sleep(250 * (i + 1));
    }
  }
}

async function handleSendError(
  userId: Types.ObjectId,
  err: GmailApiError,
  h: { requeue: () => Promise<void>; fail: (code: string, msg: string) => Promise<Outcome>; now: () => Date },
): Promise<Outcome> {
  const message = describeGmailError(err);
  const setBlock = (until: Date, reason: string) => AppSettings.updateOne({ userId }, { $set: { blockedUntil: until, blockedReason: reason } });

  switch (err.kind) {
    case "auth": {
      await h.requeue();
      await markConnection(userId, "revoked", message);
      return { type: "stop", reason: "auth", message };
    }
    case "config": {
      await h.requeue();
      await markConnection(userId, "error", message);
      return { type: "stop", reason: "config", message };
    }
    case "quota": {
      await h.requeue();
      const tz = (await AppSettings.findOne({ userId }).select("timezone").lean())?.timezone ?? "UTC";
      const until = dayBounds(tz, h.now()).end;
      await setBlock(until, message);
      return { type: "stop", reason: "blocked", message, blockedUntil: until };
    }
    case "rate": {
      await h.requeue();
      const until = new Date(h.now().getTime() + Math.max(err.retryAfterMs ?? 0, 60_000));
      await setBlock(until, message);
      return { type: "stop", reason: "blocked", message, blockedUntil: until };
    }
    case "restricted": {
      await h.requeue();
      const until = new Date(h.now().getTime() + 24 * 3600 * 1000);
      await setBlock(until, message);
      return { type: "stop", reason: "blocked", message, blockedUntil: until };
    }
    case "network":
      return h.fail("UNKNOWN_OUTCOME", `${message} Gmail may or may not have received this message. Check your Gmail Sent folder before retrying.`);
    case "transient":
      return h.fail("TRANSIENT", `${message} Retries were exhausted. You can retry from the review queue.`);
    default:
      return h.fail("REJECTED", message);
  }
}

/** Items stuck in `sending` (e.g. server crashed mid-send) have an unknown outcome: never auto-retry them. */
export async function recoverStaleSending(userId: Types.ObjectId, now: Date) {
  const cutoff = new Date(now.getTime() - STALE_SENDING_MS);
  const stale = await EmailQueue.find({ userId, status: "sending", sendingStartedAt: { $lt: cutoff } }).select("_id applicationId").lean();
  for (const s of stale) {
    const res = await EmailQueue.updateOne(
      { _id: s._id, status: "sending" },
      { $set: { status: "failed", errorCode: "UNKNOWN_OUTCOME", lastError: "Sending was interrupted before Gmail confirmed it. Check your Gmail Sent folder before retrying." } },
    );
    if (res.modifiedCount) await Application.updateOne({ _id: s.applicationId, userId }, { $set: { status: "failed" } });
  }
  return stale.length;
}
