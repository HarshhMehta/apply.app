import { json, route } from "@/lib/http";
import { AppSettings } from "@/models/AppSettings";

/** Lets the user resume sending after a Gmail pause once they've checked their account. */
export const POST = route({}, async ({ userId }) => {
  await AppSettings.updateOne({ userId }, { $set: { blockedUntil: null, blockedReason: null } });
  return json({ ok: true });
});
