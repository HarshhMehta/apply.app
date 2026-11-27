import { ApiError, json, parseBody, route } from "@/lib/http";
import { loginSchema } from "@/lib/validators";
import { verifyCredentials } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export const POST = route({ auth: false, rate: { name: "login-ip", limit: 10, windowSec: 15 * 60 } }, async ({ req }) => {
  const { email, password } = await parseBody(req, loginSchema);
  await rateLimit(`login-email:${email.toLowerCase()}`, 10, 15 * 60);
  const user = await verifyCredentials(email, password);
  if (!user) throw new ApiError(401, "Incorrect email or password", "invalid_credentials");
  await setSessionCookie(String(user._id));
  return json({ ok: true, user: { email: user.email, name: user.name } });
});

