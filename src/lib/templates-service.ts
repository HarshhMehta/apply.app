import { Types } from "mongoose";
import { EmailTemplate } from "@/models/EmailTemplate";
import { Resume } from "@/models/Resume";
import { DEFAULT_TEMPLATES } from "./email/defaults";
import { badRequest, notFound } from "./http";
import type { Category } from "./constants";

/** Seeds the four starter templates the first time a user opens the templates area. */
export async function ensureDefaultTemplates(userId: Types.ObjectId) {
  if (await EmailTemplate.exists({ userId })) return;
  try {
    await EmailTemplate.insertMany(DEFAULT_TEMPLATES.map((t) => ({ ...t, userId, isActive: true })), { ordered: false });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err; // concurrent seeding is fine
  }
}

export async function assertResumeOwned(userId: Types.ObjectId, resumeId: string | null | undefined) {
  if (resumeId && !(await Resume.exists({ _id: resumeId, userId }))) throw badRequest("Preferred resume not found");
}

export async function clearOtherDefaults(userId: Types.ObjectId, category: Category, exceptId?: Types.ObjectId) {
  await EmailTemplate.updateMany({ userId, category, isDefault: true, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, { $set: { isDefault: false } });
}

export async function getTemplateOr404(userId: Types.ObjectId, id: Types.ObjectId) {
  const t = await EmailTemplate.findOne({ _id: id, userId });
  if (!t) throw notFound("Template");
  return t;
}
