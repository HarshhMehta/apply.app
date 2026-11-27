import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    googleEmail: { type: String, required: true, lowercase: true, trim: true },
    googleSub: { type: String },
    // Both tokens are AES-256-GCM encrypted. They never leave the server.
    encRefreshToken: { type: String, required: true, select: false },
    encAccessToken: { type: String, select: false },
    accessTokenExpiresAt: { type: Date },
    scopes: { type: [String], default: [] },
    status: { type: String, enum: ["connected", "revoked", "error"], default: "connected" },
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date },
    connectedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export type GmailConnectionDoc = InferSchemaType<typeof schema>;
export const GmailConnection: Model<GmailConnectionDoc> =
  (models.GmailConnection as Model<GmailConnectionDoc>) || model<GmailConnectionDoc>("GmailConnection", schema);
