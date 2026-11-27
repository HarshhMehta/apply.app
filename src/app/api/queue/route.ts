import { json, parseBody, parseQuery, route } from "@/lib/http";
import { queueCreateSchema, queueListQuery } from "@/lib/validators";
import { createQueueItems, listQueue } from "@/lib/queue/service";

export const GET = route({}, async ({ req, userId }) => {
  const q = parseQuery(req, queueListQuery);
  return json(await listQueue(userId, q.status, { search: q.search, page: q.page, pageSize: q.pageSize }));
});

export const POST = route({ rate: { name: "queue-create", limit: 60, windowSec: 3600, by: "user" } }, async ({ req, userId }) => {
  const input = await parseBody(req, queueCreateSchema);
  const res = await createQueueItems(userId, input.items, input.mode, input.batchId);
  return json(res, { status: res.created.length ? 201 : 200 });
});
