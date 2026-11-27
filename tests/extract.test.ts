import { describe, expect, it } from "vitest";
import { extractEmails, isValidEmail, normalizeEmail } from "@/lib/email/extract";

describe("extractEmails (OCR text)", () => {
  it("finds a single address inside noisy OCR text", () => {
    const text = "Senior React Developer\nApply: send CV to Hiring.Team@Acme-Corp.co.in by Friday!";
    expect(extractEmails(text)).toEqual(["hiring.team@acme-corp.co.in"]);
  });

  it("returns multiple addresses in order and removes duplicates", () => {
    const text = "hr@a.com, jobs@b.org; HR@A.COM and careers@c.io.";
    expect(extractEmails(text)).toEqual(["hr@a.com", "jobs@b.org", "careers@c.io"]);
  });

  it("strips trailing punctuation and angle brackets", () => {
    expect(extractEmails("Contact <jane@x.com>, or (bob@y.com).")).toEqual(["jane@x.com", "bob@y.com"]);
  });

  it("understands (at)/[dot] obfuscation", () => {
    expect(extractEmails("jane (at) acme [dot] com")).toEqual(["jane@acme.com"]);
  });

  it("ignores file names that look like emails", () => {
    expect(extractEmails("logo@2x.png banner@3x.jpg")).toEqual([]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(extractEmails("")).toEqual([]);
    expect(extractEmails("no contact here @ all")).toEqual([]);
  });
});

describe("isValidEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.domain.com", " UPPER@CASE.IO "])("accepts %s", (e) => expect(isValidEmail(e)).toBe(true));
  it.each(["", "plain", "a@b", "a@@b.com", ".a@b.com", "a..b@c.com", "a b@c.com", "x@y.png", `${"a".repeat(65)}@b.com`])("rejects %j", (e) =>
    expect(isValidEmail(e)).toBe(false),
  );
  it("normalizes", () => expect(normalizeEmail("  <Foo@Bar.com>. ")).toBe("foo@bar.com"));
});
