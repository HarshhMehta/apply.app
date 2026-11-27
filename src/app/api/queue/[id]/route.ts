import { json, parseBody, parseObjectId, route } from "@/lib/http";
import { queuePatchSchema } from "@/lib/validators";
import { getQueueItem, updateQueueItem } from "@/lib/queue/service";

type P = { id: string };

export const GET = route<P>({}, async ({ userId, params }) => json({ item: await getQueueItem(userId, parseObjectId(params.id)) }));

export const PATCH = route<P>({}, async ({ req, userId, params }) => {
  const patch = await parseBody(req, queuePatchSchema);
  return json({ item: await updateQueueItem(userId, parseObjectId(params.id), patch) });
});
