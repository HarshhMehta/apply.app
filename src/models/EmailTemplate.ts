import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { CATEGORIES } from "@/lib/constants";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    category: { type: String, enum: CATEGORIES, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 10000 },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    preferredResumeId: { type: Schema.Types.ObjectId, ref: "Resume", default: null },
  },
  { timestamps: true },
);

schema.index({ userId: 1, category: 1, isActive: 1 });
// At most one default template per category per user.
schema.index({ userId: 1, category: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: "one_default_per_category" });

export type EmailTemplateDoc = InferSchemaType<typeof schema>;
export const EmailTemplate: Model<EmailTemplateDoc> =
  (models.EmailTemplate as Model<EmailTemplateDoc>) || model<EmailTemplateDoc>("EmailTemplate", schema);
