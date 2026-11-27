import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { CATEGORIES, STATUSES } from "@/lib/constants";

/**
 * One row per recipient the user has applied (or is about to apply) to.
 * The unique (userId, recipientEmail) index is what prevents duplicate applications.
 * No screenshot data is ever stored here.
 */
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    category: { type: String, enum: CATEGORIES, required: true },
    jobRole: { type: String, trim: true, maxlength: 120, default: "" },
    companyName: { type: String, trim: true, maxlength: 120, default: "" },
    subject: { type: String, required: true, maxlength: 300 },
    resumeId: { type: Schema.Types.ObjectId, ref: "Resume", default: null },
    resumeName: { type: String, default: "" },
    queueId: { type: Schema.Types.ObjectId, ref: "EmailQueue", default: null },
    status: { type: String, enum: STATUSES, required: true, default: "pending_review" },
    gmailMessageId: { type: String, default: null },
    appliedAt: { type: Date },
  },
  { timestamps: true },
);

schema.index({ userId: 1, recipientEmail: 1 }, { unique: true });
schema.index({ userId: 1, status: 1, createdAt: -1 });
schema.index({ userId: 1, category: 1, createdAt: -1 });
schema.index({ userId: 1, appliedAt: -1 });

export type ApplicationDoc = InferSchemaType<typeof schema>;
export const Application: Model<ApplicationDoc> =
  (models.Application as Model<ApplicationDoc>) || model<ApplicationDoc>("Application", schema);
