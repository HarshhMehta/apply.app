import { json, route } from "@/lib/http";
import { User } from "@/models/User";

export const GET = route({}, async ({ userId }) => {
  const u = await User.findById(userId).select("email name").lean();
  return json({ user: { email: u?.email, name: u?.name } });
});
