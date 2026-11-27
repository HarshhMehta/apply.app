import { Types } from "mongoose";
import { Application } from "@/models/Application";
import { EmailQueue } from "@/models/EmailQueue";
import { CATEGORIES, STATUSES, type Category, type Status } from "./constants";
import { dayBounds, getDailyUsage, getOrCreateSettings } from "./limits";
import { getConnectionSummary } from "./gmail/service";
import { toClient } from "./http";

export async function getDashboardData(userId: Types.ObjectId) {
  const settings = await getOrCreateSettings(userId);
  const tz = settings.timezone;
  const today = dayBounds(tz);
  const days = 14;
  const rangeStart = new Date(today.start.getTime() - (days - 1) * 86400000);

  const [byStatus, byCategory, sentRows, usage, recent, gmail, pendingApproved] = await Promise.all([
    Application.aggregate<{ _id: Status; n: number }>([{ $match: { userId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Application.aggregate<{ _id: Category; n: number }>([{ $match: { userId } }, { $group: { _id: "$category", n: { $sum: 1 } } }]),
    EmailQueue.find({ userId, status: "sent", sentAt: { $gte: rangeStart } }).select("sentAt").lean(),
    getDailyUsage(userId, tz),
    Application.find({ userId }).sort({ appliedAt: -1, createdAt: -1 }).limit(8).lean(),
    getConnectionSummary(userId),
    EmailQueue.countDocuments({ userId, status: "approved" }),
  ]);

  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, byStatus.find((x) => x._id === s)?.n ?? 0])) as Record<Status, number>;
  const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, byCategory.find((x) => x._id === c)?.n ?? 0])) as Record<Category, number>;
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  // Bucket sent emails into calendar days of the user's timezone.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const perDay = new Map<string, number>();
  for (const r of sentRows) if (r.sentAt) perDay.set(fmt.format(r.sentAt), (perDay.get(fmt.format(r.sentAt)) ?? 0) + 1);
  const series = Array.from({ length: days }, (_, i) => {
    const label = fmt.format(new Date(today.start.getTime() - (days - 1 - i) * 86400000 + 12 * 3600000));
    return { date: label, count: perDay.get(label) ?? 0 };
  });

  return {
    totals: {
      total,
      sent: statusCounts.sent,
      pendingReview: statusCounts.pending_review,
      draft: statusCounts.draft,
      failed: statusCounts.failed,
      approvedWaiting: pendingApproved,
      today: usage.used,
    },
    limits: { cap: settings.dailyCap, used: usage.used, timezone: tz, blockedUntil: settings.blockedUntil?.toISOString() ?? null, blockedReason: settings.blockedReason ?? null },
    gmail,
    statusCounts,
    categoryCounts,
    series,
    recent: toClient<unknown[]>(recent),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
