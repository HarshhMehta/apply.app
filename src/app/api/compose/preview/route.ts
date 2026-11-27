import { json, parseBody, route } from "@/lib/http";
import { composePreviewSchema } from "@/lib/validators";
import { findDuplicates, generateDrafts } from "@/lib/queue/service";

export const POST = route({}, async ({ req, userId }) => {
  const input = await parseBody(req, composePreviewSchema);
  const gen = await generateDrafts(userId, { ...input, resumeId: input.resumeId ?? null, recipients: input.recipients.map((r) => ({ email: r.email, companyName: r.companyName, recruiterName: r.recruiterName })) });
  const duplicates = await findDuplicates(userId, gen.drafts.map((d) => d.email));
  return json({ ...gen, duplicates });
});
