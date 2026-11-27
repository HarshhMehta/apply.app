import { describe, expect, it } from "vitest";
import { buildMimeMessage, encodeHeaderValue, formatAddress, toGmailRaw } from "@/lib/email/mime";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("buildMimeMessage", () => {
  it("builds a multipart message with a base64 PDF attachment", () => {
    const pdf = Buffer.from("%PDF-1.4 fake pdf bytes");
    const msg = buildMimeMessage({
      from: "Asha <asha@gmail.com>",
      to: "hr@acme.com",
      subject: "Application for Dev",
      text: "Hello\nWorld",
      attachments: [{ filename: "Asha Resume.pdf", contentType: "application/pdf", content: pdf }],
    });
    expect(msg).toMatch(/^From: Asha <asha@gmail.com>\r\nTo: hr@acme.com\r\nSubject: Application for Dev\r\n/);
    expect(msg).toContain("Content-Type: multipart/mixed; boundary=");
    expect(msg).toContain('Content-Disposition: attachment; filename="Asha Resume.pdf"');
    expect(msg).toContain(pdf.toString("base64"));
    const textB64 = msg.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
    expect(Buffer.from(textB64, "base64").toString()).toBe("Hello\r\nWorld");
  });

  it("builds a plain message when there is no attachment", () => {
    const msg = buildMimeMessage({ from: "a@b.com", to: "c@d.com", subject: "S", text: "Body" });
    expect(msg).not.toContain("multipart");
    expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
  });

  it("rejects header injection", () => {
    expect(() => buildMimeMessage({ from: "a@b.com", to: "c@d.com\r\nBcc: x@y.com", subject: "S", text: "B" })).toThrow();
    expect(() => buildMimeMessage({ from: "a@b.com", to: "c@d.com", subject: "S\nBcc: x@y.com", text: "B" })).toThrow();
  });

  it("encodes non-ASCII subjects as RFC 2047 words without splitting characters", () => {
    const subject = "Application – Développeur Full Stack ✓ 日本語のとても長い件名がここに入ります";
    const enc = encodeHeaderValue(subject);
    expect(enc).toMatch(/=\?UTF-8\?B\?/);
    const words = enc.split(/\r\n /).map((w) => Buffer.from(w.slice(10, -2), "base64").toString("utf8"));
    expect(words.join("")).toBe(subject);
    expect(Math.max(...enc.split(/\r\n /).map((w) => w.length))).toBeLessThanOrEqual(75);
  });

  it("round-trips through base64url", () => {
    const raw = toGmailRaw("héllo");
    expect(raw).not.toMatch(/[+/=]/);
    expect(decode(raw)).toBe("héllo");
  });

  it("formats From with a safe display name", () => {
    expect(formatAddress("Asha Rao", "a@b.com")).toBe("Asha Rao <a@b.com>");
    expect(formatAddress('Ev"il\r\nBcc: x', "a@b.com")).not.toMatch(/[\r\n"]/);
    expect(formatAddress("", "a@b.com")).toBe("a@b.com");
  });
});
