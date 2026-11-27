"use client";

import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmailPreview } from "@/components/new-application/draft-card";
import { api, errorMessage } from "@/lib/api-client";
import { isValidEmail } from "@/lib/email/extract";
import type { QueueItemDTO, ResumeDTO } from "@/lib/types";

const EDITABLE = ["draft", "pending_review", "failed"];

export function ItemDialog({ item, mode, resumes, from, onClose, onSaved }: { item: QueueItemDTO | null; mode: "view" | "edit"; resumes: ResumeDTO[]; from: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState({ recipientEmail: "", subject: "", body: "", resumeId: "" });
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(mode === "edit");

  React.useEffect(() => {
    if (item) {
      setForm({ recipientEmail: item.recipientEmail, subject: item.subject, body: item.body, resumeId: item.resumeId ?? "" });
      setEditing(mode === "edit");
    }
  }, [item, mode]);

  if (!item) return null;
  const canEdit = EDITABLE.includes(item.status);
  const bad = !isValidEmail(form.recipientEmail) || !form.subject.trim() || !form.body.trim();
  const preview = { key: item.id, email: form.recipientEmail, subject: form.subject, body: form.body, resumeId: form.resumeId || null, jobRole: "", companyName: "", recruiterName: "", warnings: [] };

  async function save() {
    setSaving(true);
    try {
      await api(`/api/queue/${item!.id}`, { method: "PATCH", body: { recipientEmail: form.recipientEmail, subject: form.subject, body: form.body, resumeId: form.resumeId || null } });
      toast.success("Changes saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{editing ? "Edit email" : "Email preview"} <StatusBadge status={item.status} /></DialogTitle>
          <DialogDescription>{editing ? "Changes apply to this email only." : item.recipientEmail}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {item.lastError && item.status === "failed" && <Notice tone="error" title="Last send failed">{item.lastError}</Notice>}
          {!canEdit && editing === false && item.status === "approved" && <Notice tone="info">Move this email back to review if you want to edit it.</Notice>}
          {editing ? (
            <>
              <Field id="e-to" label="Recipient" error={!isValidEmail(form.recipientEmail) ? "Enter a valid email address" : undefined}>
                <Input id="e-to" type="email" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} />
              </Field>
              <Field id="e-resume" label="Resume attachment">
                <Select id="e-resume" value={form.resumeId} onChange={(e) => setForm({ ...form, resumeId: e.target.value })}>
                  <option value="">No attachment</option>
                  {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
              <Field id="e-subject" label="Subject" error={!form.subject.trim() ? "Subject can’t be empty" : undefined}>
                <Input id="e-subject" value={form.subject} maxLength={300} onChange={(e) => setForm({ ...form, subject: e.target.value.replace(/[\r\n]+/g, " ") })} />
              </Field>
              <Field id="e-body" label="Message" error={!form.body.trim() ? "Message can’t be empty" : undefined}>
                <Textarea id="e-body" rows={14} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </Field>
            </>
          ) : (
            <EmailPreview from={from} draft={preview} resumeName={resumes.find((r) => r.id === form.resumeId)?.name ?? item.resumeName ?? undefined} />
          )}
          {item.gmailMessageId && <p className="text-[13px] text-muted-foreground">Gmail message ID: <code className="rounded bg-muted px-1.5 py-0.5">{item.gmailMessageId}</code></p>}
        </DialogBody>
        <DialogFooter>
          {editing ? (
            <>
              <Button variant="outline" onClick={() => (mode === "edit" ? onClose() : setEditing(false))}>Cancel</Button>
              <Button onClick={save} loading={saving} disabled={bad}>Save changes</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Close</Button>
              {canEdit && <Button onClick={() => setEditing(true)}>Edit</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
