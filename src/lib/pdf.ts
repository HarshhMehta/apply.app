import { ApiError, badRequest } from "./errors";
import { MAX_RESUME_BYTES } from "./constants";

/** Validates a PDF by extension, size and magic bytes (never trusts the client-supplied MIME type). */
export function validatePdf(file: { name: string; size: number }, head: Buffer) {
  if (!/\.pdf$/i.test(file.name)) throw badRequest("Only PDF files are supported");
  if (file.size === 0) throw badRequest("The file is empty");
  if (file.size > MAX_RESUME_BYTES) throw new ApiError(413, `PDF is too large. The limit is ${MAX_RESUME_BYTES / 1024 / 1024} MB.`, "too_large");
  if (!head.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw badRequest("This file doesn’t look like a valid PDF");
}
