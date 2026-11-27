import { json, parseBody, parseObjectId, route, toClient } from "@/lib/http";
import { templatePatchSchema } from "@/lib/validators";
import { badRequest } from "@/lib/errors";
import { assertResumeOwned, clearOtherDefaults, getTemplateOr404 } from "@/lib/templates-service";

type P = { id: string };

export const PATCH = route<P>({}, async ({ req, userId, params }) => {
  const id = parseObjectId(params.id);
  const patch = await parseBody(req, templatePatchSchema);
  const t = await getTemplateOr404(userId, id);
  if (patch.preferredResumeId !== undefined) await assertResumeOwned(userId, patch.preferredResumeId);

  Object.assign(t, patch);
  // Deactivating a template also removes its default flag.
  if (patch.isActive === false) t.isDefault = false;
  if (t.isDefault && !t.isActive) throw badRequest("A default template must be active");
  if (t.isDefault) await clearOtherDefaults(userId, t.category, t._id);
  await t.save();
  return json({ item: toClient(t) });
});

export const DELETE = route<P>({}, async ({ userId, params }) => {
  const t = await getTemplateOr404(userId, parseObjectId(params.id));
  await t.deleteOne();
  return json({ ok: true });
});
