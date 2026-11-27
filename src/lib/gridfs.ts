import mongoose, { Types } from "mongoose";
import { Readable } from "node:stream";
import { connectDB } from "./db";

export const RESUME_BUCKET = "resumes";

async function bucket() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: RESUME_BUCKET });
}

export async function saveResumeFile(filename: string, data: Buffer, metadata: Record<string, unknown>): Promise<Types.ObjectId> {
  const b = await bucket();
  const upload = b.openUploadStream(filename, { metadata });
  await new Promise<void>((resolve, reject) => {
    Readable.from(data).pipe(upload).on("error", reject).on("finish", () => resolve());
  });
  return upload.id as Types.ObjectId;
}

export async function readResumeFile(id: Types.ObjectId | string): Promise<Buffer> {
  const b = await bucket();
  const chunks: Buffer[] = [];
  const stream = b.openDownloadStream(new Types.ObjectId(String(id)));
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

export async function deleteResumeFile(id: Types.ObjectId | string): Promise<void> {
  const b = await bucket();
  try {
    await b.delete(new Types.ObjectId(String(id)));
  } catch (err) {
    // Missing file is fine (already deleted); anything else should surface.
    if (!(err instanceof Error) || !/FileNotFound/i.test(err.message)) throw err;
  }
}
