import { json, route } from "@/lib/http";
import { disconnectGmail } from "@/lib/gmail/service";

export const POST = route({}, async ({ userId }) => json({ ok: true, disconnected: await disconnectGmail(userId) }));
