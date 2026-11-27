import { json, parseBody, route, toClient } from "@/lib/http";
import { templateSchema } from "@/lib/validators";
import { EmailTemplate } from "@/models/EmailTemplate";
import { assertResumeOwned, clearOtherDefaults, ensureDefaultTemplates } from "@/lib/templates-service";
import { badRequest } from "@/lib/errors";

export const GET = route({}, async ({ userId }) => {
  await ensureDefaultTemplates(userId);
  const items = await EmailTemplate.find({ userId }).sort({ category: 1, isDefault: -1, name: 1 }).lean();
  return json({ items: toClient(items) });
});

export const POST = route({ rate: { name: "template-write", limit: 120, windowSec: 3600, by: "user" } }, async ({ req, userId }) => {
  const data = await parseBody(req, templateSchema);
  if (data.isDefault && !data.isActive) throw badRequest("A default template must be active");
  await assertResumeOwned(userId, data.preferredResumeId);
  if (data.isDefault) await clearOtherDefaults(userId, data.category);
  const t = await EmailTemplate.create({ ...data, userId });
  return json({ item: toClient(t) }, { status: 201 });
});
