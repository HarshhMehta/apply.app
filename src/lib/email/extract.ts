import { z } from "zod";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Filenames like logo@2x.png are not mailboxes.
const FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "pdf", "css", "js", "ico", "heic"]);
const emailSchema = z.email();

export function normalizeEmail(input: string): string {
  return input.trim().replace(/^[<(\[]+|[>)\].,;:]+$/g, "").toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const email = normalizeEmail(input);
  if (email.length > 254) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const tld = domain.split(".").pop() ?? "";
  if (FILE_EXTENSIONS.has(tld)) return false;
  return emailSchema.safeParse(email).success;
}

/** Undo common ways recruiters obfuscate addresses, e.g. "jane (at) acme [dot] com". */
export function deobfuscate(text: string): string {
  return text
    .replace(/\s*[[({<]\s*at\s*[\])}>]\s*/gi, "@")
    .replace(/\s*[[({<]\s*dot\s*[\])}>]\s*/gi, ".")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'");
}

/**
 * Finds valid, unique email addresses in free text (OCR output). Order of appearance is preserved.
 */
export function extractEmails(text: string): string[] {
  if (!text) return [];
  const found = deobfuscate(text).match(EMAIL_RE) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of found) {
    const email = normalizeEmail(raw);
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}
