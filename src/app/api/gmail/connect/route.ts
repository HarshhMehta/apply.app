import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { json, route } from "@/lib/http";
import { env, isProd } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { buildAuthUrl, OAUTH_COOKIE } from "@/lib/gmail/oauth";

/** Starts the Google OAuth flow. State + PKCE verifier live in a short-lived signed HTTP-only cookie. */
export const POST = route({ rate: { name: "gmail-connect", limit: 20, windowSec: 3600, by: "user" } }, async ({ userId }) => {
  env(); // fail early with a readable error if Google credentials are missing
  const state = randomToken(24);
  const verifier = randomToken(48);
  const token = await new SignJWT({ state, verifier })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId.toString())
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env().SESSION_SECRET));
  (await cookies()).set(OAUTH_COOKIE, token, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/api/gmail", maxAge: 600 });
  return json({ url: buildAuthUrl(state, verifier) });
});
