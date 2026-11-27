import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { CATEGORIES, STATUSES } from "@/lib/constants";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true },
    batchId: { type: String, required: true },
    recipientEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    category: { type: String, enum: CATEGORIES, required: true },
    templateId: { type: Schema.Types.ObjectId, ref: "EmailTemplate", default: null },
    resumeId: { type: Schema.Types.ObjectId, ref: "Resume", default: null },
    jobRole: { type: String, trim: true, maxlength: 120, default: "" },
    companyName: { type: String, trim: true, maxlength: 120, default: "" },
    recruiterName: { type: String, trim: true, maxlength: 120, default: "" },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 20000 },
    status: { type: String, enum: STATUSES, required: true, default: "pending_review" },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    errorCode: { type: String, default: null },
    gmailMessageId: { type: String, default: null },
    gmailThreadId: { type: String, default: null },
    approvedAt: { type: Date },
    sendingStartedAt: { type: Date },
    sentAt: { type: Date },
  },
  { timestamps: true },
);

schema.index({ userId: 1, status: 1, createdAt: -1 });
schema.index({ userId: 1, status: 1, approvedAt: 1 });
schema.index({ userId: 1, sentAt: -1 });
// Same recipient can't appear twice in one batch.
schema.index({ userId: 1, batchId: 1, recipientEmail: 1 }, { unique: true });
schema.index({ applicationId: 1 });

export type EmailQueueDoc = InferSchemaType<typeof schema>;
export const EmailQueue: Model<EmailQueueDoc> =
  (models.EmailQueue as Model<EmailQueueDoc>) || model<EmailQueueDoc>("EmailQueue", schema);
