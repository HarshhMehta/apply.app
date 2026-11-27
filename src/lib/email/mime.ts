import { randomUUID } from "node:crypto";

export type Attachment = { filename: string; contentType: string; content: Buffer };

export type MessageInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
  messageIdDomain?: string;
  date?: Date;
};

const CRLF = "\r\n";

/** Rejects CR/LF so user-supplied values can never inject extra headers. */
export function assertHeaderSafe(name: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`Invalid ${name}: line breaks are not allowed`);
  return value;
}

const wrap76 = (b64: string) => b64.match(/.{1,76}/g)?.join(CRLF) ?? "";

/** RFC 2047 encoded-word(s). Splits on code point boundaries so UTF-8 sequences are never cut. */
export function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const words: string[] = [];
  let current = "";
  for (const ch of value) {
    if (Buffer.byteLength(current + ch, "utf8") > 45) {
      words.push(current);
      current = "";
    }
    current += ch;
  }
  if (current) words.push(current);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join(`${CRLF} `);
}

const quoted = (s: string) => s.replace(/[\\"]/g, "_").replace(/[^\x20-\x7E]/g, "_");

export function buildMimeMessage(input: MessageInput): string {
  const from = assertHeaderSafe("sender", input.from);
  const to = assertHeaderSafe("recipient", input.to);
  const subject = assertHeaderSafe("subject", input.subject);
  const domain = (input.messageIdDomain ?? from.split("@")[1] ?? "localhost").replace(/[^A-Za-z0-9.-]/g, "");
  const boundary = `----=_Part_${randomUUID().replace(/-/g, "")}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Date: ${(input.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
  ];

  const bodyText = input.text.replace(/\r?\n/g, CRLF);
  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(bodyText, "utf8").toString("base64")),
  ].join(CRLF);

  if (!input.attachments?.length) {
    return [...headers, textPart].join(CRLF);
  }

  const parts = [`--${boundary}${CRLF}${textPart}`];
  for (const a of input.attachments) {
    const name = quoted(assertHeaderSafe("attachment name", a.filename));
    const utf8Name = encodeURIComponent(a.filename);
    parts.push(
      `--${boundary}${CRLF}` +
        [
          `Content-Type: ${a.contentType}; name="${name}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${name}"; filename*=UTF-8''${utf8Name}`,
          "",
          wrap76(a.content.toString("base64")),
        ].join(CRLF),
    );
  }
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", parts.join(CRLF), `--${boundary}--`, ""].join(CRLF);
}

/** Gmail's messages.send expects the RFC 822 message base64url-encoded in `raw`. */
export function toGmailRaw(message: string): string {
  return Buffer.from(message, "utf8").toString("base64url");
}

/** Builds a safe `From` header value, e.g. `Jane Doe <jane@example.com>`. */
export function formatAddress(name: string | undefined, email: string): string {
  assertHeaderSafe("sender", email);
  const clean = (name ?? "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return email;
  return `${encodeHeaderValue(clean)} <${email}>`;
}
