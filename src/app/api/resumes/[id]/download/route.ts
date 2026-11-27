import { notFound, parseObjectId, route } from "@/lib/http";
import { Resume } from "@/models/Resume";
import { readResumeFile } from "@/lib/gridfs";

/** Authenticated download. Resumes are never exposed through a public URL. */
export const GET = route<{ id: string }>({ rate: { name: "resume-download", limit: 120, windowSec: 3600, by: "user" } }, async ({ userId, params }) => {
  const r = await Resume.findOne({ _id: parseObjectId(params.id), userId }).lean();
  if (!r) throw notFound("Resume");
  const data = await readResumeFile(r.gridFsId);
  const filename = `${r.name.replace(/\.pdf$/i, "").replace(/[^\w .()-]+/g, "_") || "resume"}.pdf`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
