import { Types } from "mongoose";
import { AppSettings } from "@/models/AppSettings";
import { EmailQueue } from "@/models/EmailQueue";

/** UTC offset (ms) of `timeZone` at the given instant. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Start (inclusive) and end (exclusive) of the calendar day containing `now` in `timeZone`. */
export function dayBounds(timeZone: string, now: Date = new Date()): { start: Date; end: Date } {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const local = new Date(now.getTime() + tzOffsetMs(now, tz));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const toInstant = (day: number) => {
    const guess = Date.UTC(y, m, day);
    // Two passes handle DST transitions on the boundary.
    const first = guess - tzOffsetMs(new Date(guess), tz);
    return new Date(guess - tzOffsetMs(new Date(first), tz));
  };
  return { start: toInstant(d), end: toInstant(d + 1) };
}

export async function getOrCreateSettings(userId: Types.ObjectId) {
  return AppSettings.findOneAndUpdate({ userId }, { $setOnInsert: { userId } }, { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }).lean();
}

/** Emails sent (or currently being sent) today in the user's timezone. */
export async function getDailyUsage(userId: Types.ObjectId, timezone: string, now = new Date()) {
  const { start, end } = dayBounds(timezone, now);
  const used = await EmailQueue.countDocuments({
    userId,
    $or: [
      { status: "sent", sentAt: { $gte: start, $lt: end } },
      { status: "sending", sendingStartedAt: { $gte: start, $lt: end } },
    ],
  });
  return { used, start, end };
}
