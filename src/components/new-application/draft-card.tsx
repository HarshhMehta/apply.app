"use client";

import * as React from "react";
import { AlertTriangle, Paperclip, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Pill } from "@/components/ui/status-badge";
import { isValidEmail } from "@/lib/email/extract";
import type { ResumeDTO } from "@/lib/types";

export type Draft = {
  key: string;
  email: string;
  subject: string;
  body: string;
  resumeId: string | null;
  jobRole: string;
  companyName: string;
  recruiterName: string;
  warnings: string[];
  skipReason?: string;
};

export function EmailPreview({ from, draft, resumeName }: { from: string; draft: Draft; resumeName?: string }) {
  return (
    <div className="rounded-panel border bg-card">
      <dl className="space-y-1 border-b bg-muted/40 px-4 py-3 text-[13px]">
        <div className="flex gap-2"><dt className="w-14 text-muted-foreground">From</dt><dd className="min-w-0 truncate">{from}</dd></div>
        <div className="flex gap-2"><dt className="w-14 text-muted-foreground">To</dt><dd className="min-w-0 truncate">{draft.email}</dd></div>
        <div className="flex gap-2"><dt className="w-14 text-muted-foreground">Subject</dt><dd className="min-w-0 font-medium">{draft.subject}</dd></div>
      </dl>
      <div className="whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed">{draft.body}</div>
      {resumeName && (
        <div className="border-t px-4 py-3">
          <span className="inline-flex items-center gap-2 rounded-control border bg-muted/40 px-3 py-1.5 text-[13px]"><Paperclip className="size-3.5" /> {resumeName}.pdf</span>
        </div>
      )}
    </div>
  );
}

export function DraftCard({
  draft,
  index,
  resumes,
  from,
  onChange,
  onRemove,
}: {
  draft: Draft;
  index: number;
  resumes: ResumeDTO[];
  from: string;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const emailBad = !isValidEmail(draft.email);
  const id = `draft-${index}`;
  const resume = resumes.find((r) => r.id === draft.resumeId);

  return (
    <Card className={draft.skipReason ? "opacity-70" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{draft.email}</p>
          {draft.skipReason && <Pill className="bg-warning-soft text-warning">{draft.skipReason}</Pill>}
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-1 inline-flex rounded-control bg-muted p-0.5 text-[13px]" role="tablist" aria-label="Draft view">
            {(["edit", "preview"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)} className={`rounded-[5px] px-2.5 py-1 font-medium capitalize ${mode === m ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{m}</button>
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${draft.email} from this batch`} onClick={onRemove}><Trash2 /></Button>
        </div>
      </div>

      {draft.warnings.length > 0 && (
        <ul className="space-y-1 border-b bg-warning-soft px-4 py-2.5 text-[13px] text-warning">
          {draft.warnings.map((w) => <li key={w} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{w}</li>)}
        </ul>
      )}

      {mode === "preview" ? (
        <div className="p-4"><EmailPreview from={from} draft={draft} resumeName={resume?.name} /></div>
      ) : (
        <div className="grid gap-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${id}-to`} label="Recipient" error={emailBad ? "Enter a valid email address" : undefined}>
              <Input id={`${id}-to`} type="email" value={draft.email} aria-invalid={emailBad} onChange={(e) => onChange({ email: e.target.value })} />
            </Field>
            <Field id={`${id}-resume`} label="Resume attachment">
              <Select id={`${id}-resume`} value={draft.resumeId ?? ""} onChange={(e) => onChange({ resumeId: e.target.value || null })}>
                <option value="">No attachment</option>
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isDefault ? " (default)" : ""}</option>)}
              </Select>
            </Field>
          </div>
          <Field id={`${id}-subject`} label="Subject" error={!draft.subject.trim() ? "Subject can’t be empty" : undefined}>
            <Input id={`${id}-subject`} value={draft.subject} maxLength={300} onChange={(e) => onChange({ subject: e.target.value.replace(/[\r\n]+/g, " ") })} />
          </Field>
          <Field id={`${id}-body`} label="Message" error={!draft.body.trim() ? "Message can’t be empty" : undefined}>
            <Textarea id={`${id}-body`} rows={12} value={draft.body} onChange={(e) => onChange({ body: e.target.value })} />
          </Field>
        </div>
      )}
    </Card>
  );
}
