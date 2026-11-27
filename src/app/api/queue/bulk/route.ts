import { json, parseBody, route } from "@/lib/http";
import { bulkSchema } from "@/lib/validators";
import { runBulkAction } from "@/lib/queue/service";

export const POST = route({ rate: { name: "queue-bulk", limit: 120, windowSec: 600, by: "user" } }, async ({ req, userId }) => {
  const { ids, action } = await parseBody(req, bulkSchema);
  return json(await runBulkAction(userId, ids, action));
});
