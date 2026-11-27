import { json, route } from "@/lib/http";
import { processQueue } from "@/lib/queue/sender";
import { processSchema } from "@/lib/validators";

export const maxDuration = 60;

/** Sends a small, time-boxed slice of approved emails. The UI calls this repeatedly to show progress. */
export const POST = route({ rate: { name: "queue-process", limit: 600, windowSec: 3600, by: "user" } }, async ({ req, userId }) => {
  const raw = await req.json().catch(() => ({}));
  const { maxItems } = processSchema.parse(raw ?? {});
  return json(await processQueue(userId, { maxItems }));
});
