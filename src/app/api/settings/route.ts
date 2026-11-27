import { json, parseBody, route } from "@/lib/http";
import { settingsSchema } from "@/lib/validators";
import { AppSettings } from "@/models/AppSettings";
import { getDailyUsage, getOrCreateSettings } from "@/lib/limits";

async function payload(userId: Parameters<typeof getOrCreateSettings>[0]) {
  const s = await getOrCreateSettings(userId);
  const usage = await getDailyUsage(userId, s.timezone);
  return {
    settings: { dailyCap: s.dailyCap, sendIntervalMs: s.sendIntervalMs, maxRetries: s.maxRetries, timezone: s.timezone },
    usage: { used: usage.used },
    block: s.blockedUntil && s.blockedUntil > new Date() ? { until: s.blockedUntil.toISOString(), reason: s.blockedReason } : null,
  };
}

export const GET = route({}, async ({ userId }) => json(await payload(userId)));

export const PUT = route({}, async ({ req, userId }) => {
  const data = await parseBody(req, settingsSchema);
  await AppSettings.updateOne({ userId }, { $set: data }, { upsert: true });
  return json(await payload(userId));
});
