import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    originalFilename: { type: String, required: true, maxlength: 255 },
    gridFsId: { type: Schema.Types.ObjectId, required: true },
    size: { type: Number, required: true, min: 1 },
    contentType: { type: String, default: "application/pdf" },
    sha256: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

schema.index({ userId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: "one_default_resume" });

export type ResumeDoc = InferSchemaType<typeof schema>;
export const Resume: Model<ResumeDoc> = (models.Resume as Model<ResumeDoc>) || model<ResumeDoc>("Resume", schema);
