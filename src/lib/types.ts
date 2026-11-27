import type { Category, Status } from "./constants";

export type TemplateDTO = {
  id: string;
  name: string;
  category: Category;
  subject: string;
  body: string;
  isActive: boolean;
  isDefault: boolean;
  preferredResumeId: string | null;
  updatedAt?: string;
};

export type ResumeDTO = {
  id: string;
  name: string;
  originalFilename: string;
  size: number;
  isDefault: boolean;
  createdAt: string;
};

export type QueueItemDTO = {
  id: string;
  recipientEmail: string;
  category: Category;
  subject: string;
  body: string;
  status: Status;
  resumeId: string | null;
  resumeName: string | null;
  jobRole?: string;
  companyName?: string;
  recruiterName?: string;
  attempts: number;
  lastError: string | null;
  errorCode: string | null;
  gmailMessageId: string | null;
  sentAt?: string;
  createdAt: string;
};

export type ApplicationDTO = {
  id: string;
  recipientEmail: string;
  category: Category;
  subject: string;
  resumeName: string;
  status: Status;
  gmailMessageId: string | null;
  appliedAt?: string;
  createdAt: string;
  companyName?: string;
  jobRole?: string;
};

export type DuplicateInfo = { email: string; status: Status; blocking: boolean; appliedAt: string | null };
