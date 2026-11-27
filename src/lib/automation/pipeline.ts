/**
 * Extension point for future automation. NOT used by the UI in v1 and no job discovery is implemented.
 *
 *   JobSource → JobMatcher → ContactExtractor → draft generation → REVIEW QUEUE → (user approval) → Gmail
 *
 * Every producer, however it finds a contact, must hand its result to `enqueueForReview`. That function
 * can only create `pending_review` items (never `approved`, never sent), so no automated module can ever
 * send an application without the user approving it in the review queue.
 *
 * Only permitted sources should be used (official feeds/APIs, files the user provides). No scraping that
 * violates a site's terms (e.g. unauthorised LinkedIn scraping).
 */
import type { Types } from "mongoose";
import type { Category } from "@/lib/constants";
import { generateDrafts, createQueueItems, type DraftInput } from "@/lib/queue/service";

export type JobPosting = { source: string; externalId: string; title: string; company?: string; description?: string; url?: string };
export type JobMatch = { posting: JobPosting; category: Category; score: number };
export type Contact = { email: string; recruiterName?: string; companyName?: string };

export interface JobSource { name: string; fetchPostings(): Promise<JobPosting[]> }
export interface JobMatcher { match(postings: JobPosting[]): Promise<JobMatch[]> }
export interface ContactExtractor { extract(match: JobMatch): Promise<Contact[]> }

/** Turns contacts into drafts using a saved template and places them in the review queue. */
export async function enqueueForReview(
  userId: Types.ObjectId,
  args: { templateId: string; category: Category; jobRole?: string; resumeId?: string | null; contacts: Contact[]; batchId?: string },
) {
  const recipients: DraftInput[] = args.contacts.map((c) => ({ email: c.email, companyName: c.companyName, recruiterName: c.recruiterName }));
  const { drafts } = await generateDrafts(userId, { templateId: args.templateId, category: args.category, jobRole: args.jobRole, resumeId: args.resumeId, recipients });
  return createQueueItems(
    userId,
    drafts.map((d) => ({
      recipientEmail: d.email, category: args.category, templateId: args.templateId, resumeId: d.resumeId, jobRole: d.jobRole,
      companyName: d.companyName, recruiterName: d.recruiterName, subject: d.subject, body: d.body,
    })),
    "pending_review",
    args.batchId,
  );
}
