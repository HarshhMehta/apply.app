"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TemplatePreview } from "./template-preview";
import { api, errorMessage } from "@/lib/api-client";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/constants";
import { TEMPLATE_VARIABLES } from "@/lib/email/template";
import type { ResumeDTO, TemplateDTO } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(100),
  category: z.enum(CATEGORIES),
  subject: z.string().trim().min(1, "Subject is required").max(300).refine((s) => !/[\r\n]/.test(s), "Subject must be one line"),
  body: z.string().trim().min(1, "Email body is required").max(10000),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  preferredResumeId: z.string().nullable(),
});
type Values = z.infer<typeof schema>;

export function TemplateForm({ open, template, resumes, onClose, onSaved }: { open: boolean; template: TemplateDTO | null; resumes: ResumeDTO[]; onClose: () => void; onSaved: () => void }) {
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", category: "custom", subject: "", body: "", isActive: true, isDefault: false, preferredResumeId: null },
  });

  React.useEffect(() => {
    if (open) reset(template ? { name: template.name, category: template.category, subject: template.subject, body: template.body, isActive: template.isActive, isDefault: template.isDefault, preferredResumeId: template.preferredResumeId } : { name: "", category: "custom", subject: "Application for {{job_role}}{{#company_name}} at {{company_name}}{{/company_name}}", body: "Dear {{recruiter_name|Hiring Manager}},\n\nI am writing to apply for the {{job_role}} position{{#company_name}} at {{company_name}}{{/company_name}}.\n\nBest regards,\n{{candidate_name}}", isActive: true, isDefault: false, preferredResumeId: null });
  }, [open, template, reset]);

  const w = watch();
  const { ref: bodyReg, ...bodyProps } = register("body");

  function insert(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return setValue("body", `${w.body}${token}`, { shouldDirty: true });
    const { selectionStart: s, selectionEnd: e } = el;
    setValue("body", w.body.slice(0, s) + token + w.body.slice(e), { shouldDirty: true });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  }

  const submit = handleSubmit(async (v) => {
    try {
      const body = { ...v, isDefault: v.isActive && v.isDefault };
      if (template) await api(`/api/templates/${template.id}`, { method: "PATCH", body });
      else await api("/api/templates", { method: "POST", body });
      toast.success(template ? "Template saved" : "Template created");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Company and recruiter details are optional. Use fallbacks so the email reads well without them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="t-name" label="Template name" error={errors.name?.message}><Input id="t-name" aria-invalid={!!errors.name} {...register("name")} /></Field>
                <Field id="t-cat" label="Job category"><Select id="t-cat" {...register("category")}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</Select></Field>
              </div>
              <Field id="t-subject" label="Email subject" error={errors.subject?.message}><Input id="t-subject" aria-invalid={!!errors.subject} {...register("subject")} /></Field>
              <Field id="t-body" label="Email body" error={errors.body?.message}>
                <Textarea id="t-body" rows={13} className="font-mono text-[13px]" aria-invalid={!!errors.body} {...bodyProps} ref={(el) => { bodyReg(el); bodyRef.current = el; }} />
              </Field>
              <div>
                <p className="mb-1.5 text-[13px] font-medium">Insert variable</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => <button key={v.key} type="button" title={v.label} onClick={() => insert(v.key)} className="rounded-full border bg-muted px-2.5 py-1 text-xs font-medium hover:bg-border">{v.key}</button>)}
                </div>
                <p className="mt-2 text-[13px] text-muted-foreground">Fallback: <code>{"{{recruiter_name|Hiring Manager}}"}</code>. Show only when set: <code>{"{{#company_name}} at {{company_name}}{{/company_name}}"}</code></p>
              </div>
              <Field id="t-resume" label="Preferred resume" optional hint="Used by default when this template is selected.">
                <Controller control={control} name="preferredResumeId" render={({ field }) => (
                  <Select id="t-resume" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)}>
                    <option value="">Use my default resume</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                )} />
              </Field>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <Controller control={control} name="isActive" render={({ field }) => (
                  <div className="flex items-center gap-2"><Switch id="t-active" checked={field.value} onCheckedChange={(v) => { field.onChange(v); if (!v) setValue("isDefault", false); }} /><Label htmlFor="t-active">Active</Label></div>
                )} />
                <Controller control={control} name="isDefault" render={({ field }) => (
                  <div className="flex items-center gap-2"><Switch id="t-default" checked={field.value && w.isActive} disabled={!w.isActive} onCheckedChange={field.onChange} /><Label htmlFor="t-default">Default for {CATEGORY_LABELS[w.category]}</Label></div>
                )} />
              </div>
            </div>
            <div><p className="mb-1.5 text-[13px] font-medium">Preview</p><TemplatePreview subject={w.subject} body={w.body} /></div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{template ? "Save changes" : "Create template"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
