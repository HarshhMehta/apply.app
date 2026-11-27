"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Eye, FileText, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemplateForm } from "./template-form";
import { TemplatePreview } from "./template-preview";
import { api, errorMessage } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/constants";
import type { ResumeDTO, TemplateDTO } from "@/lib/types";

export function Templates() {
  const { data, error, loading, reload } = useFetch<{ items: TemplateDTO[] }>("/api/templates");
  const resumes = useFetch<{ items: ResumeDTO[] }>("/api/resumes");
  const [editing, setEditing] = React.useState<{ t: TemplateDTO | null } | null>(null);
  const [previewing, setPreviewing] = React.useState<TemplateDTO | null>(null);
  const [deleting, setDeleting] = React.useState<TemplateDTO | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function patch(t: TemplateDTO, body: Partial<TemplateDTO>, msg: string) {
    try {
      await api(`/api/templates/${t.id}`, { method: "PATCH", body });
      toast.success(msg);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function duplicate(t: TemplateDTO) {
    try {
      await api("/api/templates", { method: "POST", body: { name: `${t.name} (copy)`.slice(0, 100), category: t.category, subject: t.subject, body: t.body, isActive: true, isDefault: false, preferredResumeId: t.preferredResumeId } });
      toast.success("Template duplicated");
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const items = data?.items ?? [];
  return (
    <>
      <PageHeader title="Email templates" description="Reusable subjects and messages with variables like {{job_role}} and {{candidate_name}}." actions={<Button onClick={() => setEditing({ t: null })}><Plus /> New template</Button>} />
      {loading && !data ? <Card><ListSkeleton /></Card> : error ? <Card><ErrorState message={error} onRetry={reload} /></Card> : items.length === 0 ? (
        <Card><EmptyState icon={FileText} title="No templates yet" description="Create a template to start preparing applications." action={<Button onClick={() => setEditing({ t: null })}><Plus /> New template</Button>} /></Card>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map((c) => {
            const list = items.filter((t) => t.category === c);
            if (!list.length) return null;
            return (
              <section key={c} aria-labelledby={`cat-${c}`}>
                <h2 id={`cat-${c}`} className="mb-2 text-sm font-semibold text-muted-foreground">{CATEGORY_LABELS[c]}</h2>
                <Card className="divide-y">
                  {list.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
                      <div className="min-w-0 flex-1 basis-64">
                        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{t.name}</p>{t.isDefault && <Pill className="bg-primary-soft text-primary">Default</Pill>}{!t.isActive && <Pill>Inactive</Pill>}</div>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{t.subject}</p>
                      </div>
                      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Switch checked={t.isActive} onCheckedChange={(v) => patch(t, { isActive: v }, v ? "Template activated" : "Template deactivated")} aria-label={`${t.name} active`} /> Active
                      </label>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Preview ${t.name}`} onClick={() => setPreviewing(t)}><Eye /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={t.isDefault ? `${t.name} is the default` : `Make ${t.name} the default`} disabled={t.isDefault || !t.isActive} title={!t.isActive ? "Activate it first" : undefined} onClick={() => patch(t, { isDefault: true }, `Default for ${CATEGORY_LABELS[t.category]} updated`)}><Star className={t.isDefault ? "fill-current text-primary" : ""} /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing({ t })}><Pencil /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${t.name}`} onClick={() => duplicate(t)}><Copy /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}><Trash2 /></Button>
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <TemplateForm open={!!editing} template={editing?.t ?? null} resumes={resumes.data?.items ?? []} onClose={() => setEditing(null)} onSaved={reload} />

      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{previewing?.name}</DialogTitle><DialogDescription>Rendered with sample data.</DialogDescription></DialogHeader>
          <DialogBody>{previewing && <TemplatePreview subject={previewing.subject} body={previewing.body} />}</DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete “${deleting?.name}”?`} description="Emails already prepared from this template are not affected." confirmLabel="Delete template" destructive loading={busy}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try { await api(`/api/templates/${deleting.id}`, { method: "DELETE" }); toast.success("Template deleted"); await reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); setDeleting(null); }
        }} />
    </>
  );
}
