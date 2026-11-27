import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const str = (max: number) => ({ type: String, trim: true, maxlength: max, default: "" });
const list = { type: [{ type: String, trim: true, maxlength: 60 }], default: [], validate: (v: string[]) => v.length <= 50 };

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    candidateName: str(100),
    professionalEmail: str(254),
    phone: str(40),
    currentTitle: str(100),
    yearsOfExperience: { type: Number, min: 0, max: 60, default: null },
    primarySkills: list,
    secondarySkills: list,
    preferredRoles: list,
    preferredLocations: list,
    portfolioUrl: str(300),
    linkedinUrl: str(300),
    githubUrl: str(300),
  },
  { timestamps: true },
);

export type CandidateProfileDoc = InferSchemaType<typeof schema>;
export const CandidateProfile: Model<CandidateProfileDoc> =
  (models.CandidateProfile as Model<CandidateProfileDoc>) || model<CandidateProfileDoc>("CandidateProfile", schema);
