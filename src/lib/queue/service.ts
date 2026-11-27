import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { Application } from "@/models/Application";
import { EmailQueue } from "@/models/EmailQueue";
import { EmailTemplate } from "@/models/EmailTemplate";
import { Resume } from "@/models/Resume";
import { CandidateProfile } from "@/models/CandidateProfile";
import { ApiError, badRequest, notFound, toClient } from "@/lib/http";
import { CATEGORY_LABELS, STATUSES, type Category, type Status } from "@/lib/constants";
import { escapeRegex } from "@/lib/utils";
import { isValidEmail, normalizeEmail } from "@/lib/email/extract";
import { renderSubject, renderTemplate, type TemplateVars } from "@/lib/email/template";
import { ACTIONS, DELETABLE_STATUSES, EDITABLE_STATUSES, canTransition, type BulkAction } from "./status";

/* ------------------------------------------------------------------ */
/* Drafting                                                            */
/* ------------------------------------------------------------------ */

type ProfileLean = Awaited<ReturnType<typeof loadProfile>>;

export async function loadProfile(userId: Types.ObjectId) {
  return CandidateProfile.findOne({ userId }).lean();
}

export function profileVars(p: ProfileLean | null): TemplateVars {
  return {
    candidate_name: p?.candidateName,
    candidate_email: p?.professionalEmail,
    candidate_phone: p?.phone,
    current_title: p?.currentTitle,
    years_experience: p?.yearsOfExperience != null ? String(p.yearsOfExperience) : "",
    primary_skills: p?.primarySkills?.join(", "),
    secondary_skills: p?.secondarySkills?.join(", "),
    portfolio_url: p?.portfolioUrl,
    linkedin_url: p?.linkedinUrl,
    github_url: p?.githubUrl,
  };
}

export type DraftInput = { email: string; companyName?: string; recruiterName?: string };

export async function generateDrafts(
  userId: Types.ObjectId,
  opts: { templateId: string; category?: Category; jobRole?: string; resumeId?: string | null; recipients: DraftInput[] },
) {
  const template = await EmailTemplate.findOne({ _id: opts.templateId, userId }).lean();
  if (!template) throw notFound("Template");
  const category = opts.category ?? template.category;
  const profile = await loadProfile(userId);
  const base = profileVars(profile);
  const jobRole = opts.jobRole?.trim() || (category === "custom" ? "" : CATEGORY_LABELS[category]);

  // Resume precedence: explicit choice > template's preferred resume > default resume.
  let resumeId: string | null = opts.resumeId ?? null;
  if (!resumeId && template.preferredResumeId) resumeId = String(template.preferredResumeId);
  if (resumeId && !(await Resume.exists({ _id: resumeId, userId }))) resumeId = null;
  if (!resumeId) {
    const def = await Resume.findOne({ userId, isDefault: true }).select("_id").lean();
    resumeId = def ? String(def._id) : null;
  }

  const drafts = opts.recipients.map((r) => {
    const vars: TemplateVars = { ...base, job_role: jobRole || "advertised", company_name: r.companyName, recruiter_name: r.recruiterName };
    const subject = renderSubject(template.subject, vars);
    const body = renderTemplate(template.body, vars);
    const warnings = [...new Set([...subject.missing, ...body.missing])].map((m) => `Missing ${m.replace(/_/g, " ")}. Add it in Settings → Candidate profile.`);
    for (const u of new Set([...subject.unknown, ...body.unknown])) warnings.push(`Unknown variable {{${u}}} left in the text.`);
    return { email: normalizeEmail(r.email), subject: subject.text, body: body.text, resumeId, jobRole, companyName: r.companyName ?? "", recruiterName: r.recruiterName ?? "", warnings };
  });
  return { drafts, category, templateId: String(template._id) };
}

/* ------------------------------------------------------------------ */
/* Creating queue items                                                */
/* ------------------------------------------------------------------ */

export type NewItem = {
  recipientEmail: string;
  category: Category;
  templateId?: string | null;
  resumeId?: string | null;
  jobRole?: string;
  companyName?: string;
  recruiterName?: string;
  subject: string;
  body: string;
};

const BLOCKING: Status[] = ["pending_review", "approved", "sending", "sent"];

export async function createQueueItems(userId: Types.ObjectId, items: NewItem[], mode: "pending_review" | "draft", batchId?: string) {
  const batch = batchId ?? randomUUID();
  const created: unknown[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const seen = new Set<string>();

  const emails = items.map((i) => normalizeEmail(i.recipientEmail));
  const existing = await Application.find({ userId, recipientEmail: { $in: emails } }).lean();
  const existingByEmail = new Map(existing.map((a) => [a.recipientEmail, a]));

  const resumeIds = [...new Set(items.map((i) => i.resumeId).filter((x): x is string => !!x))];
  const resumes = await Resume.find({ userId, _id: { $in: resumeIds } }).select("name").lean();
  const resumeName = new Map(resumes.map((r) => [String(r._id), r.name]));
  const templateIds = [...new Set(items.map((i) => i.templateId).filter((x): x is string => !!x))];
  const validTemplates = new Set((await EmailTemplate.find({ userId, _id: { $in: templateIds } }).select("_id").lean()).map((t) => String(t._id)));

  for (const item of items) {
    const email = normalizeEmail(item.recipientEmail);
    if (!isValidEmail(email)) {
      skipped.push({ email, reason: "Not a valid email address" });
      continue;
    }
    if (seen.has(email)) {
      skipped.push({ email, reason: "Duplicate in this batch" });
      continue;
    }
    seen.add(email);

    if (item.resumeId && !resumeName.has(item.resumeId)) {
      skipped.push({ email, reason: "Selected resume no longer exists" });
      continue;
    }
    const prior = existingByEmail.get(email);
    if (prior && BLOCKING.includes(prior.status as Status)) {
      skipped.push({ email, reason: `Already ${prior.status === "sent" ? "applied to" : "in your queue"} (${prior.status.replace("_", " ")})` });
      continue;
    }

    try {
      let applicationId: Types.ObjectId;
      const appFields = {
        category: item.category,
        jobRole: item.jobRole ?? "",
        companyName: item.companyName ?? "",
        subject: item.subject,
        resumeId: item.resumeId ? new Types.ObjectId(item.resumeId) : null,
        resumeName: item.resumeId ? (resumeName.get(item.resumeId) ?? "") : "",
        status: mode,
        gmailMessageId: null,
        appliedAt: new Date(),
      };
      if (prior) {
        // Re-applying after a rejected/failed/draft attempt: replace the old queue entry.
        await EmailQueue.deleteMany({ userId, applicationId: prior._id, status: { $in: ["draft", "rejected", "failed"] } });
        await Application.updateOne({ _id: prior._id, userId }, { $set: appFields });
        applicationId = prior._id;
      } else {
        const app = await Application.create({ userId, recipientEmail: email, ...appFields });
        applicationId = app._id;
      }
      const q = await EmailQueue.create({
        userId,
        applicationId,
        batchId: batch,
        recipientEmail: email,
        category: item.category,
        templateId: item.templateId && validTemplates.has(item.templateId) ? new Types.ObjectId(item.templateId) : null,
        resumeId: appFields.resumeId,
        jobRole: item.jobRole ?? "",
        companyName: item.companyName ?? "",
        recruiterName: item.recruiterName ?? "",
        subject: item.subject,
        body: item.body,
        status: mode,
      });
      await Application.updateOne({ _id: applicationId }, { $set: { queueId: q._id } });
      created.push(toClient(q));
    } catch (err) {
      if ((err as { code?: number }).code === 11000) skipped.push({ email, reason: "Already exists in your applications" });
      else throw err;
    }
  }
  return { batchId: batch, created, skipped };
}

/** Which of these emails already have an application, and in what state. */
export async function findDuplicates(userId: Types.ObjectId, emails: string[]) {
  const norm = [...new Set(emails.map(normalizeEmail))];
  const apps = await Application.find({ userId, recipientEmail: { $in: norm } }).select("recipientEmail status appliedAt").lean();
  return apps.map((a) => ({ email: a.recipientEmail, status: a.status, blocking: BLOCKING.includes(a.status as Status), appliedAt: a.appliedAt?.toISOString() ?? null }));
}

/* ------------------------------------------------------------------ */
/* Listing / updating                                                  */
/* ------------------------------------------------------------------ */

export async function listQueue(userId: Types.ObjectId, statuses: Status[], opts: { search?: string; page: number; pageSize: number }) {
  const filter: Record<string, unknown> = { userId, status: { $in: statuses } };
  if (opts.search) {
    const rx = new RegExp(escapeRegex(opts.search), "i");
    filter.$or = [{ recipientEmail: rx }, { subject: rx }, { companyName: rx }];
  }
  const [rows, total, counts] = await Promise.all([
    EmailQueue.find(filter).sort({ createdAt: -1 }).skip((opts.page - 1) * opts.pageSize).limit(opts.pageSize).lean(),
    EmailQueue.countDocuments(filter),
    EmailQueue.aggregate<{ _id: Status; n: number }>([{ $match: { userId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  const resumeIds = [...new Set(rows.map((r) => r.resumeId).filter(Boolean))];
  const resumes = await Resume.find({ _id: { $in: resumeIds } }).select("name").lean();
  const names = new Map(resumes.map((r) => [String(r._id), r.name]));
  const items = rows.map((r) => ({ ...toClient<Record<string, unknown>>(r), resumeName: r.resumeId ? (names.get(String(r.resumeId)) ?? null) : null }));
  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0]));
  return { items, total, statusCounts };
}

export async function getQueueItem(userId: Types.ObjectId, id: Types.ObjectId) {
  const q = await EmailQueue.findOne({ _id: id, userId }).lean();
  if (!q) throw notFound("Email");
  const resume = q.resumeId ? await Resume.findOne({ _id: q.resumeId, userId }).select("name").lean() : null;
  return { ...toClient<Record<string, unknown>>(q), resumeName: resume?.name ?? null };
}

export async function updateQueueItem(
  userId: Types.ObjectId,
  id: Types.ObjectId,
  patch: { recipientEmail?: string; subject?: string; body?: string; resumeId?: string | null },
) {
  const q = await EmailQueue.findOne({ _id: id, userId });
  if (!q) throw notFound("Email");
  if (!EDITABLE_STATUSES.includes(q.status as Status)) {
    throw new ApiError(409, q.status === "sent" ? "Sent emails can’t be edited." : `Move this email back to review before editing (status: ${q.status.replace("_", " ")}).`, "not_editable");
  }
  const setApp: Record<string, unknown> = {};
  if (patch.recipientEmail !== undefined) {
    const email = normalizeEmail(patch.recipientEmail);
    if (!isValidEmail(email)) throw badRequest("Enter a valid recipient email");
    if (email !== q.recipientEmail) {
      const clash = await Application.exists({ userId, recipientEmail: email, _id: { $ne: q.applicationId } });
      if (clash) throw new ApiError(409, "You already have an application for that address.", "duplicate");
      q.recipientEmail = email;
      setApp.recipientEmail = email;
    }
  }
  if (patch.subject !== undefined) {
    q.subject = patch.subject;
    setApp.subject = patch.subject;
  }
  if (patch.body !== undefined) q.body = patch.body;
  if (patch.resumeId !== undefined) {
    if (patch.resumeId) {
      const r = await Resume.findOne({ _id: patch.resumeId, userId }).select("name").lean();
      if (!r) throw badRequest("Selected resume not found");
      q.resumeId = r._id;
      setApp.resumeId = r._id;
      setApp.resumeName = r.name;
    } else {
      q.resumeId = null;
      setApp.resumeId = null;
      setApp.resumeName = "";
    }
  }
  await q.save();
  if (Object.keys(setApp).length) await Application.updateOne({ _id: q.applicationId, userId }, { $set: setApp });
  return getQueueItem(userId, id);
}

/* ------------------------------------------------------------------ */
/* Bulk actions                                                        */
/* ------------------------------------------------------------------ */

export async function runBulkAction(userId: Types.ObjectId, ids: string[], action: BulkAction) {
  const items = await EmailQueue.find({ userId, _id: { $in: ids } }).lean();
  const done: string[] = [];
  const skipped: { id: string; email: string; reason: string }[] = [];

  for (const q of items) {
    const status = q.status as Status;
    if (action === "delete") {
      if (!DELETABLE_STATUSES.includes(status)) {
        skipped.push({ id: String(q._id), email: q.recipientEmail, reason: status === "sent" ? "Sent emails stay in your history" : "Can’t delete while sending" });
        continue;
      }
      const res = await EmailQueue.deleteOne({ _id: q._id, userId, status });
      if (res.deletedCount) {
        await Application.deleteOne({ _id: q.applicationId, userId, status: { $ne: "sent" } });
        done.push(String(q._id));
      }
      continue;
    }

    const rule = ACTIONS[action];
    if (!rule.from.includes(status) || !canTransition(status, rule.to)) {
      skipped.push({ id: String(q._id), email: q.recipientEmail, reason: `Can’t ${action} an email that is ${status.replace("_", " ")}` });
      continue;
    }
    if (action === "approve") {
      if (!q.subject.trim() || !q.body.trim() || !isValidEmail(q.recipientEmail)) {
        skipped.push({ id: String(q._id), email: q.recipientEmail, reason: "Subject, body and a valid recipient are required" });
        continue;
      }
      if (q.resumeId && !(await Resume.exists({ _id: q.resumeId, userId }))) {
        skipped.push({ id: String(q._id), email: q.recipientEmail, reason: "The selected resume was deleted. Choose another resume." });
        continue;
      }
    }
    const set: Record<string, unknown> = { status: rule.to };
    const unset: Record<string, 1> = {};
    if (rule.to === "approved") {
      set.approvedAt = new Date();
      set.lastError = null;
      set.errorCode = null;
    }
    if (action === "unapprove") unset.approvedAt = 1;
    const res = await EmailQueue.updateOne({ _id: q._id, userId, status }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    if (res.modifiedCount) {
      await Application.updateOne({ _id: q.applicationId, userId }, { $set: { status: rule.to } });
      done.push(String(q._id));
    } else {
      skipped.push({ id: String(q._id), email: q.recipientEmail, reason: "Status changed while processing" });
    }
  }
  return { done, skipped };
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export type HistoryQuery = { search?: string; status?: Status; category?: Category; from?: string; to?: string; page: number; pageSize: number };

export async function listHistory(userId: Types.ObjectId, q: HistoryQuery) {
  const filter: Record<string, unknown> = { userId };
  if (q.status) filter.status = q.status;
  if (q.category) filter.category = q.category;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ recipientEmail: rx }, { subject: rx }, { companyName: rx }, { gmailMessageId: rx }];
  }
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = new Date(`${q.from}T00:00:00.000Z`);
    if (q.to) range.$lte = new Date(`${q.to}T23:59:59.999Z`);
    filter.appliedAt = range;
  }
  const [rows, total] = await Promise.all([
    Application.find(filter).sort({ appliedAt: -1, createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
    Application.countDocuments(filter),
  ]);
  return { items: toClient(rows), total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) };
}
