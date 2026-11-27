"use client";

import { extractEmails } from "@/lib/email/extract";

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPTED_EXT = /\.(png|jpe?g|webp)$/i;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateImage(file: File): string | null {
  if (!ACCEPTED_EXT.test(file.name) || (file.type && !ACCEPTED_TYPES.includes(file.type))) return "Use a PNG, JPG, JPEG or WEBP screenshot.";
  if (file.size > MAX_IMAGE_BYTES) return "This image is larger than 10 MB. Crop it or use a smaller screenshot.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

/** Small screenshots OCR poorly. Upscale + grayscale in the browser before recognition. */
async function prepare(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const longest = Math.max(bmp.width, bmp.height);
    const scale = longest < 1600 ? Math.min(3, 1600 / longest) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.filter = "grayscale(1) contrast(1.15)";
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/png"));
  } catch {
    return file;
  }
}

/**
 * Runs Tesseract.js entirely in the browser. The image is never uploaded or stored;
 * only the recognised text is used, and only email addresses are kept from it.
 */
export async function readEmailsFromImage(file: File, onProgress?: (pct: number) => void): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(Math.round(m.progress * 100));
    },
    ...(process.env.NEXT_PUBLIC_TESSERACT_LANG_PATH ? { langPath: process.env.NEXT_PUBLIC_TESSERACT_LANG_PATH } : {}),
  });
  try {
    const input = await prepare(file);
    const { data } = await worker.recognize(input);
    return extractEmails(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}
