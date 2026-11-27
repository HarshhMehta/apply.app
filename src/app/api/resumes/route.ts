import { ApiError, badRequest, json, route, toClient } from "@/lib/http";
import { Resume } from "@/models/Resume";
import { deleteResumeFile, saveResumeFile } from "@/lib/gridfs";
import { sha256Hex } from "@/lib/crypto";
import { MAX_RESUMES } from "@/lib/constants";
import { validatePdf } from "@/lib/pdf";

export const GET = route({}, async ({ userId }) => {
  const items = await Resume.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
  return json({ items: toClient(items) });
});

export const POST = route({ rate: { name: "resume-upload", limit: 30, windowSec: 3600, by: "user" } }, async ({ req, userId }) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Upload the PDF as multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a PDF file to upload");
  const buf = Buffer.from(await file.arrayBuffer());
  validatePdf({ name: file.name, size: buf.length }, buf);

  if ((await Resume.countDocuments({ userId })) >= MAX_RESUMES) throw new ApiError(409, `You can store up to ${MAX_RESUMES} resumes. Delete one first.`, "limit");

  const rawName = String(form.get("name") ?? "").trim() || file.name.replace(/\.pdf$/i, "");
  const name = rawName.replace(/[\r\n]+/g, " ").slice(0, 120);
  const hash = sha256Hex(buf);
  const dupe = await Resume.findOne({ userId, sha256: hash }).select("name").lean();
  if (dupe) throw new ApiError(409, `This file is already uploaded as “${dupe.name}”.`, "duplicate");

  const gridFsId = await saveResumeFile(file.name, buf, { userId: String(userId), sha256: hash });
  const first = !(await Resume.exists({ userId }));
  try {
    const r = await Resume.create({ userId, name, originalFilename: file.name.slice(0, 255), gridFsId, size: buf.length, sha256: hash, isDefault: first });
    return json({ item: toClient(r) }, { status: 201 });
  } catch (err) {
    await deleteResumeFile(gridFsId).catch(() => undefined);
    throw err;
  }
});
