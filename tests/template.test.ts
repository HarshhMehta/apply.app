import { describe, expect, it } from "vitest";
import { renderSubject, renderTemplate } from "@/lib/email/template";
import { DEFAULT_TEMPLATES } from "@/lib/email/defaults";

const candidate = { candidate_name: "Asha Rao", job_role: "Frontend Developer" };

describe("renderTemplate", () => {
  it("substitutes variables", () => {
    expect(renderTemplate("Hi {{recruiter_name}}, I am {{candidate_name}}", { ...candidate, recruiter_name: "Sam" }).text).toBe("Hi Sam, I am Asha Rao");
  });

  it("falls back gracefully without recruiter or company", () => {
    const r = renderTemplate("Dear {{recruiter_name}}, interest in {{job_role}} at {{company_name}}.", candidate);
    expect(r.text).toBe("Dear Hiring Manager, interest in Frontend Developer at your organization.");
    expect(r.missing).toEqual([]);
  });

  it("supports inline fallbacks and conditional sections", () => {
    const tpl = "Role{{#company_name}} at {{company_name}}{{/company_name}}{{^company_name}} (company not stated){{/company_name}}.";
    expect(renderTemplate(tpl, {}).text).toBe("Role (company not stated).");
    expect(renderTemplate(tpl, { company_name: "Acme" }).text).toBe("Role at Acme.");
    expect(renderTemplate("Hi {{recruiter_name|there}}", {}).text).toBe("Hi there");
  });

  it("supports nested sections", () => {
    const tpl = "{{#a_x}}x{{/a_x}}{{#current_title}}T{{#years_experience}}+{{years_experience}}y{{/years_experience}}{{/current_title}}";
    expect(renderTemplate(tpl, { current_title: "Dev", years_experience: "3" }).text).toBe("T+3y");
    expect(renderTemplate(tpl, { current_title: "Dev" }).text).toBe("T");
    expect(renderTemplate(tpl, { years_experience: "3" }).text).toBe("");
  });

  it("reports missing candidate fields and unknown variables", () => {
    const r = renderTemplate("{{candidate_name}} {{nope}}", {});
    expect(r.missing).toContain("candidate_name");
    expect(r.unknown).toContain("nope");
    expect(r.text).toContain("{{nope}}");
  });

  it("tidies spacing left by empty values", () => {
    expect(renderTemplate("Hello {{#company_name}}{{company_name}} {{/company_name}} team , bye", {}).text).toBe("Hello team, bye");
  });

  it("never lets values break subject lines", () => {
    expect(renderSubject("Hi {{company_name}}", { company_name: "Acme\r\nBcc: x@y.com" }).text).not.toMatch(/[\r\n]/);
  });
});

describe("default templates", () => {
  const profile = { candidate_name: "Asha Rao", job_role: "Backend Developer", candidate_email: "asha@example.com", primary_skills: "Node.js, MongoDB" };

  it("produce clean text with no company or recruiter", () => {
    for (const t of DEFAULT_TEMPLATES) {
      const body = renderTemplate(t.body, profile);
      const subject = renderSubject(t.subject, profile);
      expect(body.unknown).toEqual([]);
      expect(body.text).toContain("Dear Hiring Manager,");
      expect(body.text).not.toMatch(/\{\{|undefined|null/);
      expect(body.text).not.toMatch(/ {2,}|\n{3,}/);
      expect(body.text).toContain("My core skills include Node.js, MongoDB.");
      expect(subject.text).toBe("Application for Backend Developer – Asha Rao");
    }
  });

  it("include company and recruiter when provided", () => {
    const body = renderTemplate(DEFAULT_TEMPLATES[0].body, { ...profile, company_name: "Acme", recruiter_name: "Sam" });
    expect(body.text).toContain("Dear Sam,");
    expect(body.text).toContain("position at Acme.");
  });

  it("handle a completely empty profile without leaving gaps", () => {
    const body = renderTemplate(DEFAULT_TEMPLATES[2].body, { job_role: "Full Stack Developer" });
    expect(body.text).not.toMatch(/\{\{/);
    expect(body.text.endsWith("Best regards,")).toBe(true);
  });
});
