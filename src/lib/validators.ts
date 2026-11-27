import { z } from "zod";
import { CATEGORIES, STATUSES } from "./constants";
import { isValidEmail } from "./email/extract";
import { isValidTimeZone } from "./limits";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
const oneLine = (max: number) => z.string().trim().max(max).refine((s) => !/[\r\n]/.test(s), "Line breaks are not allowed");
const email = z.string().trim().min(1, "Enter an email address").refine(isValidEmail, "Enter a valid email address");
const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+$/i.test(v), "Enter a full URL starting with http:// or https://")
  .default("");
const stringList = z.array(z.string().trim().min(1).max(60)).max(50).default([]);

export const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });

export const templateSchema = z.object({
  name: oneLine(100).min(1, "Give the template a name"),
  category: z.enum(CATEGORIES),
  subject: oneLine(300).min(1, "Subject is required"),
  body: z.string().trim().min(1, "Email body is required").max(10000),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  preferredResumeId: objectId.nullable().default(null),
});
export const templatePatchSchema = templateSchema.partial();

export const resumePatchSchema = z
  .object({ name: oneLine(120).min(1, "Name can’t be empty").optional(), isDefault: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isDefault !== undefined, "Nothing to update");

export const profileSchema = z.object({
  candidateName: oneLine(100).default(""),
  professionalEmail: z.string().trim().max(254).refine((v) => v === "" || isValidEmail(v), "Enter a valid email address").default(""),
  phone: oneLine(40).default(""),
  currentTitle: oneLine(100).default(""),
  yearsOfExperience: z.number().min(0).max(60).nullable().default(null),
  primarySkills: stringList,
  secondarySkills: stringList,
  preferredRoles: stringList,
  preferredLocations: stringList,
  portfolioUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  githubUrl: optionalUrl,
});

export const settingsSchema = z.object({
  dailyCap: z.number().int().min(1).max(2000),
  sendIntervalMs: z.number().int().min(500).max(60000),
  maxRetries: z.number().int().min(0).max(5),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
});

const recipient = z.object({
  email,
  companyName: oneLine(120).optional(),
  recruiterName: oneLine(120).optional(),
});

export const composePreviewSchema = z.object({
  templateId: objectId,
  category: z.enum(CATEGORIES).optional(),
  jobRole: oneLine(120).optional(),
  resumeId: objectId.nullable().optional(),
  recipients: z.array(recipient).min(1, "Add at least one email").max(200),
});

export const queueItemSchema = z.object({
  recipientEmail: email,
  category: z.enum(CATEGORIES),
  templateId: objectId.nullable().optional(),
  resumeId: objectId.nullable().optional(),
  jobRole: oneLine(120).optional(),
  companyName: oneLine(120).optional(),
  recruiterName: oneLine(120).optional(),
  subject: oneLine(300).min(1, "Subject is required"),
  body: z.string().trim().min(1, "Email body is required").max(20000),
});

export const queueCreateSchema = z.object({
  mode: z.enum(["pending_review", "draft"]).default("pending_review"),
  batchId: z.string().min(8).max(64).optional(),
  items: z.array(queueItemSchema).min(1).max(200),
});

export const queuePatchSchema = z
  .object({
    recipientEmail: email.optional(),
    subject: oneLine(300).min(1, "Subject is required").optional(),
    body: z.string().trim().min(1, "Email body is required").max(20000).optional(),
    resumeId: objectId.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const bulkSchema = z.object({
  ids: z.array(objectId).min(1).max(500),
  action: z.enum(["approve", "reject", "submit", "retry", "unapprove", "delete"]),
});

export const queueListQuery = z.object({
  status: z
    .string()
    .default("pending_review")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(STATUSES)).min(1)),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const historyQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const duplicatesSchema = z.object({ emails: z.array(z.string().max(254)).min(1).max(500) });

export const processSchema = z.object({ maxItems: z.number().int().min(1).max(10).default(5) }).default({ maxItems: 5 });
