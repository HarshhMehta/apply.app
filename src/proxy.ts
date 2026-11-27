import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Optimistic page guard: redirects signed-out visitors to /login before any page renders.
 * This is NOT the security boundary. Every API route and the (app) layout re-verify the session on the server.
 */
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-jaa_session" : "jaa_session";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  let ok = false;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), { algorithms: ["HS256"] });
      ok = true;
    } catch {
      ok = false;
    }
  }
  const { pathname } = req.nextUrl;
  if (pathname === "/login") {
    return ok ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }
  if (!ok) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/applications/:path*", "/review/:path*", "/history/:path*", "/templates/:path*", "/resumes/:path*", "/gmail/:path*", "/settings/:path*", "/login"],
};
