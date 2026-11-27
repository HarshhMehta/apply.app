import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
// MongoDB removes expired windows automatically.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitDoc = InferSchemaType<typeof schema>;
export const RateLimit: Model<RateLimitDoc> = (models.RateLimit as Model<RateLimitDoc>) || model<RateLimitDoc>("RateLimit", schema);
