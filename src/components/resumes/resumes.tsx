"use client";

import * as React from "react";
import { toast } from "sonner";
import { Download, FileStack, Pencil, Star, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/components/ui/format";
import { api, errorMessage } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { MAX_RESUME_BYTES } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { ResumeDTO } from "@/lib/types";

export function Resumes() {
  const { data, error, loading, reload } = useFetch<{ items: ResumeDTO[] }>("/api/resumes");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [renaming, setRenaming] = React.useState<ResumeDTO | null>(null);
  const [name, setName] = React.useState("");
  const [deleting, setDeleting] = React.useState<ResumeDTO | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      if (!/\.pdf$/i.test(file.name)) { toast.error(`${file.name}: only PDF files are supported`); continue; }
      if (file.size > MAX_RESUME_BYTES) { toast.error(`${file.name}: larger than ${MAX_RESUME_BYTES / 1024 / 1024} MB`); continue; }
      const form = new FormData();
      form.append("file", file);
      try { await api("/api/resumes", { method: "POST", body: form }); ok++; } catch (e) { toast.error(`${file.name}: ${errorMessage(e)}`); }
    }
    if (ok) toast.success(`Uploaded ${ok} resume${ok === 1 ? "" : "s"}`);
    if (inputRef.current) inputRef.current.value = "";
    setUploading(false);
    await reload();
  }

  async function patch(id: string, body: object, msg: string) {
    try { await api(`/api/resumes/${id}`, { method: "PATCH", body }); toast.success(msg); await reload(); return true; } catch (e) { toast.error(errorMessage(e)); return false; }
  }

  const items = data?.items ?? [];
  return (
    <>
      <PageHeader title="Resume manager" description="PDF resumes are stored privately and only attached to emails by the server. They’re never available through a public link."
        actions={<><input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" id="resume-file" onChange={(e) => void upload(e.target.files)} /><Button onClick={() => inputRef.current?.click()} loading={uploading}><Upload /> Upload PDF</Button></>} />
      <Card>
        {loading && !data ? <ListSkeleton rows={3} /> : error ? <ErrorState message={error} onRetry={reload} /> : items.length === 0 ? (
          <EmptyState icon={FileStack} title="No resumes uploaded" description={`Upload one or more PDF resumes (up to ${MAX_RESUME_BYTES / 1024 / 1024} MB each). The first one becomes your default.`} action={<Button onClick={() => inputRef.current?.click()}><Upload /> Upload PDF</Button>} />
        ) : (
          <ul className="divide-y">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{r.name}</p>{r.isDefault && <Pill className="bg-primary-soft text-primary">Default</Pill>}</div>
                  <p className="truncate text-[13px] text-muted-foreground">{r.originalFilename} · {formatBytes(r.size)} · uploaded {formatDate(r.createdAt)}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={r.isDefault ? `${r.name} is the default` : `Make ${r.name} the default`} disabled={r.isDefault} onClick={() => patch(r.id, { isDefault: true }, "Default resume updated")}><Star className={r.isDefault ? "fill-current text-primary" : ""} /></Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Rename ${r.name}`} onClick={() => { setRenaming(r); setName(r.name); }}><Pencil /></Button>
                  <Button asChild variant="ghost" size="icon-sm"><a href={`/api/resumes/${r.id}/download`} aria-label={`Download ${r.name}`}><Download /></a></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}><Trash2 /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-md">
          <form onSubmit={async (e) => { e.preventDefault(); if (renaming && name.trim() && (await patch(renaming.id, { name: name.trim() }, "Resume renamed"))) setRenaming(null); }}>
            <DialogHeader><DialogTitle>Rename resume</DialogTitle><DialogDescription>This name is what you see here and what the recipient sees as the attachment name.</DialogDescription></DialogHeader>
            <DialogBody><Field id="rn" label="Name" error={!name.trim() ? "Name can’t be empty" : undefined}><Input id="rn" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field></DialogBody>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button><Button type="submit" disabled={!name.trim()}>Save name</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Delete “${deleting?.name}”?`} description="The file is permanently removed. Emails already sent keep their history." confirmLabel="Delete resume" destructive loading={busy}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          try { await api(`/api/resumes/${deleting.id}`, { method: "DELETE" }); toast.success("Resume deleted"); await reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); setDeleting(null); }
        }} />
    </>
  );
}
