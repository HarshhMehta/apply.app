import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Types } from "mongoose";
import { env } from "./env";
import { connectDB } from "./db";
import { getSessionUserId } from "./session";
import { rateLimit } from "./rate-limit";
import { ApiError, badRequest } from "./errors";

export { ApiError, badRequest, notFound, conflict } from "./errors";
import { User } from "@/models/User";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Recursively turns Mongo documents into plain JSON: _id -> id, ObjectId -> string, drops __v and userId. */
export function toClient<T = unknown>(input: unknown): T {
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (v instanceof Types.ObjectId) return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const src = v as Record<string, unknown>;
      if (typeof (src as { toObject?: unknown }).toObject === "function") return walk((src as { toObject: () => unknown }).toObject());
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(src)) {
        if (k === "__v" || k === "userId") continue;
        out[k === "_id" ? "id" : k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(input) as T;
}

export function parseObjectId(id: string, label = "id"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id) || String(new Types.ObjectId(id)) !== id.toLowerCase()) throw badRequest(`Invalid ${label}`);
  return new Types.ObjectId(id);
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** CSRF defence for cookie-authenticated mutations: Origin must match APP_URL (or be a same-origin fetch). */
export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== new URL(env().APP_URL).origin) throw new ApiError(403, "Cross-origin request blocked", "csrf");
    return;
  }
  if (req.headers.get("sec-fetch-site") === "same-origin") return;
  throw new ApiError(403, "Missing Origin header", "csrf");
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export function formatZodError(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status, headers: err.headers });
  }
  if (err instanceof ZodError) {
    const fields = formatZodError(err);
    const first = Object.entries(fields)[0];
    return NextResponse.json(
      { error: { code: "validation_error", message: first ? `${first[0] === "_" ? "" : first[0] + ": "}${first[1]}` : "Invalid input", details: fields } },
      { status: 400 },
    );
  }
  const e = err as { code?: number; name?: string; message?: string };
  if (e?.code === 11000) {
    return NextResponse.json({ error: { code: "conflict", message: "A record with these values already exists" } }, { status: 409 });
  }
  if (e?.name === "MongooseServerSelectionError" || e?.name === "MongoServerSelectionError") {
    return NextResponse.json({ error: { code: "db_unavailable", message: "Cannot reach the database. Check MONGODB_URI and that MongoDB is running." } }, { status: 503 });
  }
  console.error("[api] unhandled error:", err);
  return NextResponse.json({ error: { code: "internal_error", message: "Something went wrong on the server" } }, { status: 500 });
}

type Ctx<P> = { req: NextRequest; userId: Types.ObjectId; params: P };
type RouteOpts = {
  auth?: boolean;
  rate?: { name: string; limit: number; windowSec: number; by?: "ip" | "user" };
};

/**
 * Wraps a route handler with: CSRF origin check, server-side auth, rate limiting, uniform error JSON.
 * Every protected endpoint goes through this, so authorization is never left to the client.
 */
export function route<P = Record<string, string>>(opts: RouteOpts, fn: (ctx: Ctx<P>) => Promise<Response>) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      await connectDB();
      let userId = new Types.ObjectId("000000000000000000000000");
      if (opts.auth !== false) {
        const sub = await getSessionUserId();
        if (!sub || !Types.ObjectId.isValid(sub) || !(await User.exists({ _id: sub }))) {
          throw new ApiError(401, "Please sign in", "unauthorized");
        }
        userId = new Types.ObjectId(sub);
      }
      if (opts.rate) {
        const id = opts.rate.by === "user" ? userId.toString() : clientIp(req);
        await rateLimit(`${opts.rate.name}:${id}`, opts.rate.limit, opts.rate.windowSec);
      }
      const params = (context?.params ? await context.params : {}) as P;
      return await fn({ req, userId, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
