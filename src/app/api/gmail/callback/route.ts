import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { env, isProd } from "@/lib/env";
import { connectDB } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { safeEqual, encrypt } from "@/lib/crypto";
import { exchangeCode, GmailAuthError, OAUTH_COOKIE } from "@/lib/gmail/oauth";
import { GmailConnection } from "@/models/GmailConnection";

function back(query: Record<string, string>) {
  const url = new URL("/gmail", env().APP_URL);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/api/gmail", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.redirect(new URL("/login", env().APP_URL));

    const params = req.nextUrl.searchParams;
    if (params.get("error")) {
      return back({ error: params.get("error") === "access_denied" ? "You declined the Google permission request." : `Google returned an error: ${params.get("error")}` });
    }
    const code = params.get("code");
    const state = params.get("state");
    const cookie = (await cookies()).get(OAUTH_COOKIE)?.value;
    if (!code || !state || !cookie) return back({ error: "The sign-in session expired. Start the connection again." });

    let payload: { sub?: string; state?: string; verifier?: string };
    try {
      payload = (await jwtVerify(cookie, new TextEncoder().encode(env().SESSION_SECRET), { algorithms: ["HS256"] })).payload as typeof payload;
    } catch {
      return back({ error: "The sign-in session expired. Start the connection again." });
    }
    if (!payload.state || !payload.verifier || payload.sub !== userId || !safeEqual(payload.state, state)) {
      return back({ error: "Security check failed (state mismatch). Start the connection again." });
    }

    const t = await exchangeCode(code, payload.verifier);
    await connectDB();
    await GmailConnection.findOneAndUpdate(
      { userId },
      {
        $set: {
          googleEmail: t.email,
          googleSub: t.sub,
          encRefreshToken: encrypt(t.refreshToken),
          encAccessToken: encrypt(t.accessToken),
          accessTokenExpiresAt: t.expiresAt,
          scopes: t.scopes,
          status: "connected",
          lastError: null,
          connectedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    return back({ connected: "1" });
  } catch (err) {
    if (err instanceof GmailAuthError) return back({ error: err.message });
    console.error("[gmail/callback]", err);
    return back({ error: "Could not connect Gmail. Check the server logs and your Google Cloud settings." });
  }
}
