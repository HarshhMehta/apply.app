import { ApiError, json, notFound, parseBody, parseObjectId, route, toClient } from "@/lib/http";
import { resumePatchSchema } from "@/lib/validators";
import { Resume } from "@/models/Resume";
import { EmailTemplate } from "@/models/EmailTemplate";
import { EmailQueue } from "@/models/EmailQueue";
import { deleteResumeFile } from "@/lib/gridfs";

type P = { id: string };

export const PATCH = route<P>({}, async ({ req, userId, params }) => {
  const id = parseObjectId(params.id);
  const patch = await parseBody(req, resumePatchSchema);
  const r = await Resume.findOne({ _id: id, userId });
  if (!r) throw notFound("Resume");
  if (patch.name !== undefined) r.name = patch.name;
  if (patch.isDefault === true && !r.isDefault) {
    await Resume.updateMany({ userId, isDefault: true }, { $set: { isDefault: false } });
    r.isDefault = true;
  } else if (patch.isDefault === false && r.isDefault) {
    throw new ApiError(400, "Choose another resume as the default instead.", "bad_request");
  }
  await r.save();
  return json({ item: toClient(r) });
});

export const DELETE = route<P>({}, async ({ userId, params }) => {
  const id = parseObjectId(params.id);
  const r = await Resume.findOne({ _id: id, userId });
  if (!r) throw notFound("Resume");

  const inUse = await EmailQueue.countDocuments({ userId, resumeId: id, status: { $in: ["draft", "pending_review", "approved", "sending", "failed"] } });
  if (inUse > 0) {
    throw new ApiError(409, `This resume is attached to ${inUse} email${inUse === 1 ? "" : "s"} in your queue. Change their resume or remove them first.`, "in_use");
  }
  await deleteResumeFile(r.gridFsId);
  await r.deleteOne();
  await EmailTemplate.updateMany({ userId, preferredResumeId: id }, { $set: { preferredResumeId: null } });
  if (r.isDefault) {
    const next = await Resume.findOne({ userId }).sort({ createdAt: -1 });
    if (next) await Resume.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }
  return json({ ok: true });
});
