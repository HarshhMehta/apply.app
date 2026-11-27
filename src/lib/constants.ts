export const CATEGORIES = ["frontend", "backend", "fullstack", "custom"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  frontend: "Frontend Developer",
  backend: "Backend Developer",
  fullstack: "Full Stack Developer",
  custom: "Custom",
};

export const STATUSES = ["draft", "pending_review", "approved", "sending", "sent", "failed", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  rejected: "Rejected",
};

export const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10 MB (Gmail caps a whole message at ~25 MB)
export const MAX_RESUMES = 20;
