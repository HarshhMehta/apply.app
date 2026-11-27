import { RateLimit } from "@/models/RateLimit";
import { ApiError } from "./errors";

/**
 * Fixed-window limiter stored in MongoDB (works across multiple server instances).
 * Throws a 429 ApiError with Retry-After when the limit is exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSec * 1000));
  const windowEnd = (bucket + 1) * windowSec * 1000;
  const doc = await RateLimit.findOneAndUpdate(
    { key: `${key}:${bucket}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd + 60_000) } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (doc && doc.count > limit) {
    const retry = Math.max(1, Math.ceil((windowEnd - now) / 1000));
    throw new ApiError(429, `Too many requests. Try again in ${retry}s.`, "rate_limited", undefined, { "Retry-After": String(retry) });
  }
}
