"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Lock, Mail, ShieldCheck, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, ListSkeleton, Notice } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDateTime } from "@/components/ui/format";
import { api, errorMessage } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";

type Status = { connection: { email: string; status: "connected" | "revoked" | "error"; lastError: string | null; connectedAt: string | null } | null };

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, error, loading, reload } = useFetch<Status>("/api/gmail/status");
  const [connecting, setConnecting] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [flash, setFlash] = React.useState<{ ok: boolean; text: string } | null>(null);

  React.useEffect(() => {
    if (params.get("connected")) setFlash({ ok: true, text: "Gmail connected. You can now send approved emails." });
    else if (params.get("error")) setFlash({ ok: false, text: params.get("error")! });
    if (params.get("connected") || params.get("error")) router.replace("/gmail");
  }, [params, router]);

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await api<{ url: string }>("/api/gmail/connect", { method: "POST" });
      window.location.href = url;
    } catch (e) {
      toast.error(errorMessage(e));
      setConnecting(false);
    }
  }

  const c = data?.connection;
  const ok = c?.status === "connected";

  return (
    <>
      <PageHeader title="Gmail integration" description="Emails are sent with the official Gmail API from your own account." />
      <div className="space-y-5">
        {flash && <Notice tone={flash.ok ? "success" : "error"} title={flash.ok ? "Connected" : "Couldn’t connect Gmail"}>{flash.text}</Notice>}

        <Card>
          <CardHeader><div><CardTitle>Connected account</CardTitle><CardDescription>Only one Gmail account can be connected.</CardDescription></div></CardHeader>
          <CardContent>
            {loading && !data ? <ListSkeleton rows={1} /> : error ? <ErrorState message={error} onRetry={reload} /> : c ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-11 place-items-center rounded-full ${ok ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"}`}>{ok ? <CheckCircle2 /> : <Unplug />}</span>
                    <div><p className="font-medium">{c.email}</p><p className={`text-[13px] ${ok ? "text-success" : "text-destructive"}`}>{ok ? `Connected${c.connectedAt ? ` · since ${formatDateTime(c.connectedAt)}` : ""}` : c.status === "revoked" ? "Access was revoked" : "Needs attention"}</p></div>
                  </div>
                  <div className="flex gap-2">
                    {!ok && <Button onClick={connect} loading={connecting}>Reconnect</Button>}
                    <Button variant="destructive-outline" onClick={() => setConfirm(true)}>Disconnect</Button>
                  </div>
                </div>
                {!ok && <Notice tone="error" title="Sending is disabled">{c.lastError ?? "Google no longer honours this connection."} Reconnect to continue.</Notice>}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Mail /></span><div><p className="font-medium">No account connected</p><p className="text-[13px] text-muted-foreground">You’ll be sent to Google to approve sending permission.</p></div></div>
                <Button onClick={connect} loading={connecting}>Connect Gmail account</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>What this app can and can’t do</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div className="text-sm"><p className="font-medium">Send only</p><p className="text-muted-foreground">It requests the <code className="rounded bg-muted px-1">gmail.send</code> permission and your email address. It can’t read, search or delete anything in your inbox.</p></div></div>
            <div className="flex gap-3"><Lock className="mt-0.5 size-5 shrink-0 text-primary" /><div className="text-sm"><p className="font-medium">Tokens stay on the server</p><p className="text-muted-foreground">Google credentials are encrypted at rest and never sent to your browser. Disconnecting revokes them with Google.</p></div></div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Disconnect Gmail?" description="Approved emails will stay queued but can’t send until you connect an account again. Access is also revoked on Google’s side." confirmLabel="Disconnect" destructive loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try { await api("/api/gmail/disconnect", { method: "POST" }); toast.success("Gmail disconnected"); await reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); setConfirm(false); }
        }} />
    </>
  );
}

export function GmailIntegration() {
  return <React.Suspense fallback={<ListSkeleton rows={3} />}><Inner /></React.Suspense>;
}
