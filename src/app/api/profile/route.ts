import { json, parseBody, route, toClient } from "@/lib/http";
import { profileSchema } from "@/lib/validators";
import { CandidateProfile } from "@/models/CandidateProfile";

export const GET = route({}, async ({ userId }) => {
  const p = await CandidateProfile.findOne({ userId }).lean();
  return json({ profile: p ? toClient(p) : profileSchema.parse({}) });
});

export const PUT = route({}, async ({ req, userId }) => {
  const data = await parseBody(req, profileSchema);
  const p = await CandidateProfile.findOneAndUpdate({ userId }, { $set: data }, { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }).lean();
  return json({ profile: toClient(p) });
});
