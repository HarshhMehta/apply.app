"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { renderSubject, renderTemplate } from "@/lib/email/template";

const SAMPLE = {
  candidate_name: "Alex Candidate", candidate_email: "alex@example.com", candidate_phone: "+00 000 000 0000", current_title: "Software Engineer",
  years_experience: "4", primary_skills: "TypeScript, React, Node.js", job_role: "Full Stack Developer",
};

/** Live preview with sample data. Toggle shows the output when company/recruiter are unknown. */
export function TemplatePreview({ subject, body }: { subject: string; body: string }) {
  const [withDetails, setWithDetails] = React.useState(false);
  const vars = { ...SAMPLE, ...(withDetails ? { company_name: "Acme Corp", recruiter_name: "Jordan Lee" } : {}) };
  const s = renderSubject(subject, vars);
  const b = renderTemplate(body, vars);
  const unknown = [...new Set([...s.unknown, ...b.unknown])];
  return (
    <div className="rounded-panel border">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-[13px]">
        <span className="text-muted-foreground">Sample data</span>
        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-[var(--primary)]" checked={withDetails} onChange={(e) => setWithDetails(e.target.checked)} /> Include company &amp; recruiter</label>
      </div>
      {unknown.length > 0 && <p className="flex items-start gap-2 bg-warning-soft px-3 py-2 text-[13px] text-warning"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Unknown variable: {unknown.map((u) => `{{${u}}}`).join(", ")}</p>}
      <div className="border-b px-3 py-2.5 text-sm"><span className="text-muted-foreground">Subject: </span><span className="font-medium">{s.text || "—"}</span></div>
      <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap px-3 py-3 text-sm leading-relaxed">{b.text || <span className="text-muted-foreground">Nothing to preview yet.</span>}</div>
    </div>
  );
}
