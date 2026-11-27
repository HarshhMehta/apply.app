import { json, route } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

export const POST = route({ auth: false }, async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
