import { json, parseBody, route } from "@/lib/http";
import { duplicatesSchema } from "@/lib/validators";
import { findDuplicates } from "@/lib/queue/service";

export const POST = route({}, async ({ req, userId }) => {
  const { emails } = await parseBody(req, duplicatesSchema);
  return json({ duplicates: await findDuplicates(userId, emails) });
});
