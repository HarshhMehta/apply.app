import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // Application-level cap. Gmail enforces its own, lower or equal, limits per account.
    dailyCap: { type: Number, min: 1, max: 2000, default: 100 },
    sendIntervalMs: { type: Number, min: 500, max: 60000, default: 2000 },
    maxRetries: { type: Number, min: 0, max: 5, default: 3 },
    timezone: { type: String, default: "UTC", maxlength: 64 },
    blockedUntil: { type: Date, default: null },
    blockedReason: { type: String, default: null },
  },
  { timestamps: true },
);

export type AppSettingsDoc = InferSchemaType<typeof schema>;
export const AppSettings: Model<AppSettingsDoc> =
  (models.AppSettings as Model<AppSettingsDoc>) || model<AppSettingsDoc>("AppSettings", schema);
