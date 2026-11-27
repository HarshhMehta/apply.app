"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Eye, Inbox, Pencil, RotateCcw, Search, Send, Trash2, Undo2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, ListSkeleton, Notice } from "@/components/ui/states";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ItemDialog } from "./item-dialog";
import { api, errorMessage } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { CATEGORY_LABELS, type Status } from "@/lib/constants";
import type { QueueItemDTO, ResumeDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

type Action = "approve" | "reject" | "submit" | "retry" | "unapprove" | "delete";
type Res = { items: QueueItemDTO[]; total: number; statusCounts: Record<Status, number> };
type SendState = { running: boolean; total: number; sent: number; failed: number; message?: string; stop?: string };

const TABS = [
  { id: "pending", label: "Pending review", statuses: "pending_review", counts: ["pending_review"] },
  { id: "approved", label: "Approved", statuses: "approved,sending", counts: ["approved", "sending"] },
  { id: "failed", label: "Failed", statuses: "failed", counts: ["failed"] },
  { id: "draft", label: "Drafts", statuses: "draft", counts: ["draft"] },
  { id: "rejected", label: "Rejected", statuses: "rejected", counts: ["rejected"] },
] as const;
const PAGE_SIZE = 25;

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.find((t) => t.id === params.get("tab")) ?? TABS[0];
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<Action | null>(null);
  const [dialog, setDialog] = React.useState<{ item: QueueItemDTO; mode: "view" | "edit" } | null>(null);
  const [confirm, setConfirm] = React.useState<{ ids: string[]; action: "delete" | "reject" } | null>(null);
  const [send, setSend] = React.useState<SendState>({ running: false, total: 0, sent: 0, failed: 0 });
  const cancelRef = React.useRef(false);

  React.useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const url = `/api/queue?status=${tab.statuses}&page=${page}&pageSize=${PAGE_SIZE}${q ? `&search=${encodeURIComponent(q)}` : ""}`;
  const { data, error, loading, reload } = useFetch<Res>(url);
  const resumes = useFetch<{ items: ResumeDTO[] }>("/api/resumes");
  const gmail = useFetch<{ connection: { email: string; status: string } | null }>("/api/gmail/status");
  const items = data?.items ?? [];
  const counts = data?.statusCounts;
  const countFor = (ids: readonly string[]) => ids.reduce((a, s) => a + (counts?.[s as Status] ?? 0), 0);
  const approvedCount = counts?.approved ?? 0;
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  React.useEffect(() => setSelected(new Set()), [tab.id, page, q]);

  function setTab(id: string) { setPage(1); router.replace(`/review?tab=${id}`); }

  async function run(action: Action, ids: string[]) {
    setBusy(action);
    try {
      const r = await api<{ done: string[]; skipped: { email: string; reason: string }[] }>("/api/queue/bulk", { method: "POST", body: { ids, action } });
      const verb = { approve: "Approved", reject: "Rejected", submit: "Moved to review", retry: "Re-queued", unapprove: "Moved back to review", delete: "Deleted" }[action];
      if (r.done.length) toast.success(`${verb} ${r.done.length} email${r.done.length === 1 ? "" : "s"}`);
      if (r.skipped.length) toast.warning(r.skipped.slice(0, 3).map((s) => `${s.email}: ${s.reason}`).join("\n"), { duration: 8000 });
      setSelected(new Set());
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function sendApproved() {
    cancelRef.current = false;
    const state: SendState = { running: true, total: approvedCount, sent: 0, failed: 0 };
    setSend({ ...state });
    try {
      for (let i = 0; i < 400 && !cancelRef.current; i++) {
        const r = await api<{ sent: number; failed: number; remaining: number; stopReason: string; message?: string }>("/api/queue/process", { method: "POST", body: { maxItems: 3 } });
        state.sent += r.sent;
        state.failed += r.failed;
        state.total = Math.max(state.total, state.sent + state.failed + r.remaining);
        setSend({ ...state });
        void reload();
        if (!["limit", "time"].includes(r.stopReason)) {
          state.message = r.stopReason === "idle" ? undefined : r.message;
          state.stop = r.stopReason;
          break;
        }
      }
    } catch (e) {
      state.message = errorMessage(e);
      state.stop = "error";
    }
    state.running = false;
    setSend({ ...state });
    if (state.sent) toast.success(`Sent ${state.sent} email${state.sent === 1 ? "" : "s"}`);
    if (state.failed) toast.error(`${state.failed} email${state.failed === 1 ? "" : "s"} failed. See the Failed tab.`);
    void reload();
  }

  const done = send.sent + send.failed;
  const connected = gmail.data?.connection?.status === "connected";

  return (
    <>
      <PageHeader title="Review queue" description="Every email waits here for your approval. Approving doesn’t send it until you press Send approved." />

      {(approvedCount > 0 || send.running || send.total > 0) && (
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{send.running ? `Sending… ${done} of ${send.total}` : approvedCount > 0 ? `${approvedCount} approved email${approvedCount === 1 ? "" : "s"} ready to send` : "Sending finished"}</p>
              <p className="text-[13px] text-muted-foreground">Sent one at a time, with a pause between each, within your daily cap.</p>
            </div>
            {send.running ? (
              <Button variant="outline" onClick={() => { cancelRef.current = true; }}>Stop after current email</Button>
            ) : (
              <Button onClick={sendApproved} disabled={approvedCount === 0 || !connected}><Send /> Send {approvedCount || ""} approved</Button>
            )}
          </div>
          {(send.running || send.total > 0) && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={send.total} aria-valuenow={done} aria-label="Sending progress">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${send.total ? (done / send.total) * 100 : 0}%` }} />
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{send.sent} sent{send.failed ? ` · ${send.failed} failed` : ""}</p>
            </div>
          )}
          {!connected && !send.running && approvedCount > 0 && <div className="mt-3"><Notice tone="warning" action={<Button asChild size="sm" variant="outline"><Link href="/gmail">Connect Gmail</Link></Button>}>{gmail.data?.connection ? "Gmail access needs to be reconnected before sending." : "Connect a Gmail account to send."}</Notice></div>}
          {send.message && !send.running && send.stop !== "idle" && <div className="mt-3"><Notice tone={send.stop === "cap" ? "info" : "warning"} title={{ cap: "Daily limit reached", blocked: "Sending paused", auth: "Gmail needs reconnecting", not_connected: "Gmail not connected", config: "Gmail API setup needed", error: "Couldn’t continue" }[send.stop ?? ""] ?? "Stopped"}>{send.message}</Notice></div>}
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 pt-3">
          <div role="tablist" aria-label="Queue status" className="-mb-px flex flex-wrap gap-1">
            {TABS.map((t) => {
              const n = countFor(t.counts);
              return (
                <button key={t.id} role="tab" aria-selected={tab.id === t.id} onClick={() => setTab(t.id)} className={cn("flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium", tab.id === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {t.label}{counts && <span className="rounded-full bg-muted px-1.5 text-xs">{n}</span>}
                </button>
              );
            })}
          </div>
          <div className="relative mb-2 w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Search the queue" placeholder="Search email, subject, company" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-primary-soft px-4 py-2.5 text-sm" role="region" aria-label="Bulk actions">
            <span className="mr-2 font-medium">{selected.size} selected</span>
            {tab.id === "pending" && <Button size="sm" loading={busy === "approve"} onClick={() => run("approve", [...selected])}><Check /> Approve selected</Button>}
            {tab.id === "approved" && <Button size="sm" variant="outline" loading={busy === "unapprove"} onClick={() => run("unapprove", [...selected])}><Undo2 /> Back to review</Button>}
            {tab.id === "failed" && <Button size="sm" loading={busy === "retry"} onClick={() => run("retry", [...selected])}><RotateCcw /> Retry selected</Button>}
            {["draft", "rejected", "failed"].includes(tab.id) && <Button size="sm" variant="outline" loading={busy === "submit"} onClick={() => run("submit", [...selected])}>Move to review</Button>}
            {tab.id !== "rejected" && <Button size="sm" variant="outline" onClick={() => setConfirm({ ids: [...selected], action: "reject" })}><X /> Reject</Button>}
            <Button size="sm" variant="destructive-outline" onClick={() => setConfirm({ ids: [...selected], action: "delete" })}><Trash2 /> Delete</Button>
          </div>
        )}

        {loading && !data ? <ListSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : items.length === 0 ? (
          <EmptyState icon={Inbox} title={q ? "No matching emails" : `Nothing in ${tab.label.toLowerCase()}`} description={q ? "Try a different search." : tab.id === "pending" ? "Prepared emails land here for your approval." : undefined}
            action={!q && tab.id === "pending" ? <Button asChild><Link href="/applications/new">New application</Link></Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-[13px] text-muted-foreground">
                <tr>
                  <th className="w-10 py-2.5 pl-4"><Checkbox aria-label="Select all" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} /></th>
                  <th className="px-3 py-2.5 font-medium">Recipient</th><th className="px-3 py-2.5 font-medium">Category</th><th className="px-3 py-2.5 font-medium">Subject &amp; preview</th><th className="px-3 py-2.5 font-medium">Resume</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it) => (
                  <tr key={it.id} className={cn("align-top", selected.has(it.id) && "bg-primary-soft/50")}>
                    <td className="py-3 pl-4"><Checkbox aria-label={`Select ${it.recipientEmail}`} checked={selected.has(it.id)} onChange={(e) => setSelected((p) => { const n = new Set(p); if (e.target.checked) n.add(it.id); else n.delete(it.id); return n; })} /></td>
                    <td className="max-w-[200px] truncate px-3 py-3 font-medium">{it.recipientEmail}</td>
                    <td className="whitespace-nowrap px-3 py-3">{CATEGORY_LABELS[it.category]}</td>
                    <td className="max-w-[320px] px-3 py-3"><p className="truncate font-medium">{it.subject}</p><p className="line-clamp-2 text-[13px] text-muted-foreground">{it.body.replace(/\s+/g, " ")}</p>{it.status === "failed" && it.lastError && <p className="mt-1 text-[13px] text-destructive">{it.lastError}</p>}</td>
                    <td className="max-w-[140px] truncate px-3 py-3 text-muted-foreground">{it.resumeName ?? "None"}</td>
                    <td className="px-3 py-3"><StatusBadge status={it.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`View ${it.recipientEmail}`} onClick={() => setDialog({ item: it, mode: "view" })}><Eye /></Button>
                        {["draft", "pending_review", "failed"].includes(it.status) && <Button variant="ghost" size="icon-sm" aria-label={`Edit ${it.recipientEmail}`} onClick={() => setDialog({ item: it, mode: "edit" })}><Pencil /></Button>}
                        {it.status === "pending_review" && <Button variant="ghost" size="icon-sm" className="text-success" aria-label={`Approve ${it.recipientEmail}`} disabled={!!busy} onClick={() => run("approve", [it.id])}><Check /></Button>}
                        {it.status === "failed" && <Button variant="ghost" size="icon-sm" aria-label={`Retry ${it.recipientEmail}`} disabled={!!busy} onClick={() => run("retry", [it.id])}><RotateCcw /></Button>}
                        {["draft", "rejected"].includes(it.status) && <Button variant="ghost" size="icon-sm" aria-label={`Move ${it.recipientEmail} to review`} disabled={!!busy} onClick={() => run("submit", [it.id])}><Undo2 /></Button>}
                        {["draft", "pending_review", "approved", "failed"].includes(it.status) && <Button variant="ghost" size="icon-sm" aria-label={`Reject ${it.recipientEmail}`} onClick={() => setConfirm({ ids: [it.id], action: "reject" })}><X /></Button>}
                        {it.status !== "sending" && <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Delete ${it.recipientEmail}`} onClick={() => setConfirm({ ids: [it.id], action: "delete" })}><Trash2 /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / PAGE_SIZE))} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} />}
      </Card>

      <ItemDialog item={dialog?.item ?? null} mode={dialog?.mode ?? "view"} resumes={resumes.data?.items ?? []} from={gmail.data?.connection?.email ?? "Your Gmail address"} onClose={() => setDialog(null)} onSaved={reload} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === "delete" ? `Delete ${confirm.ids.length} email${confirm.ids.length === 1 ? "" : "s"}?` : `Reject ${confirm?.ids.length ?? 0} email${confirm?.ids.length === 1 ? "" : "s"}?`}
        description={confirm?.action === "delete" ? "This removes the email and its application record. It can’t be undone. Emails that were already sent stay in your history." : "Rejected emails won’t be sent. You can move them back to review later."}
        confirmLabel={confirm?.action === "delete" ? "Delete" : "Reject"}
        destructive
        loading={!!busy}
        onConfirm={async () => { if (confirm) await run(confirm.action, confirm.ids); }}
      />
    </>
  );
}

export function ReviewQueue() {
  return <React.Suspense fallback={<ListSkeleton />}><Inner /></React.Suspense>;
}
