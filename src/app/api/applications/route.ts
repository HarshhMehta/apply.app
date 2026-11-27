import { json, parseQuery, route } from "@/lib/http";
import { historyQuery } from "@/lib/validators";
import { listHistory } from "@/lib/queue/service";

export const GET = route({}, async ({ req, userId }) => json(await listHistory(userId, parseQuery(req, historyQuery))));
