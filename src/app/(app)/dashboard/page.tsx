import Link from "next/link";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { FilePlus2, Mail, Inbox } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Pill } from "@/components/ui/status-badge";
import { Notice, EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/components/ui/format";
import { connectDB } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { getDashboardData } from "@/lib/dashboard";
import { CATEGORY_LABELS, STATUSES, STATUS_LABELS, CATEGORIES, type Category, type Status } from "@/lib/constants";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Recent = { id: string; recipientEmail: string; category: Category; subject: string; status: Status; appliedAt?: string; createdAt: string };

function Stat({ label, value, href, hint }: { label: string; value: number; href?: string; hint?: string }) {
  const body = (
    <div className="px-5 py-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none">{value.toLocaleString()}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block hover:bg-muted/50">{body}</Link> : body;
}

export default async function DashboardPage() {
  const sub = await getSessionUserId();
  if (!sub) redirect("/login");
  await connectDB();
  const d = await getDashboardData(new Types.ObjectId(sub));
  const pct = Math.min(100, Math.round((d.limits.used / d.limits.cap) * 100));
  const maxDay = Math.max(1, ...d.series.map((s) => s.count));
  const maxCat = Math.max(1, ...Object.values(d.categoryCounts));
  const recent = d.recent as Recent[];
  const gmailOk = d.gmail?.status === "connected";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where your applications stand today."
        actions={<Button asChild><Link href="/applications/new"><FilePlus2 /> New application</Link></Button>}
      />

      <div className="mb-5 space-y-3">
        {!d.gmail && (
          <Notice tone="warning" title="Gmail isn’t connected" action={<Button asChild size="sm" variant="outline"><Link href="/gmail">Connect Gmail</Link></Button>}>
            You can prepare and review emails, but nothing can be sent until you connect an account.
          </Notice>
        )}
        {d.gmail && !gmailOk && (
          <Notice tone="error" title="Gmail needs attention" action={<Button asChild size="sm" variant="outline"><Link href="/gmail">Reconnect</Link></Button>}>
            {d.gmail.lastError ?? "Access to this account was revoked."}
          </Notice>
        )}
        {d.limits.blockedUntil && new Date(d.limits.blockedUntil) > new Date() && (
          <Notice tone="warning" title="Sending is paused">{d.limits.blockedReason} Resumes {formatDateTime(d.limits.blockedUntil)}.</Notice>
        )}
        {d.totals.approvedWaiting > 0 && (
          <Notice tone="info" title={`${d.totals.approvedWaiting} approved email${d.totals.approvedWaiting === 1 ? " is" : "s are"} waiting to send`} action={<Button asChild size="sm" variant="outline"><Link href="/review">Open queue</Link></Button>} />
        )}
      </div>

      <Card className="mb-5 grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0 [&>*]:border-0">
        <Stat label="Total applications" value={d.totals.total} href="/history" />
        <Stat label="Emails sent" value={d.totals.sent} href="/history?status=sent" />
        <Stat label="Pending reviews" value={d.totals.pendingReview} href="/review" />
        <Stat label="Draft emails" value={d.totals.draft} href="/review?tab=draft" />
        <Stat label="Failed emails" value={d.totals.failed} href="/review?tab=failed" />
        <Stat label="Today’s applications" value={d.totals.today} hint={`of ${d.limits.cap} allowed`} />
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Today’s sending allowance</CardTitle>
              <CardDescription>Your own daily cap. Gmail applies its own limits on top of this.</CardDescription>
            </div>
            <p className="text-sm"><span className="text-xl font-semibold">{d.limits.used}</span> <span className="text-muted-foreground">/ {d.limits.cap}</span></p>
          </CardHeader>
          <CardContent>
            <div className="relative h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={d.limits.cap} aria-valuenow={d.limits.used} aria-label="Emails sent today">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              {[25, 50, 75].map((t) => <span key={t} className="absolute inset-y-0 w-px bg-card/80" style={{ left: `${t}%` }} aria-hidden />)}
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">{d.limits.cap - d.limits.used > 0 ? `${d.limits.cap - d.limits.used} left today` : "Daily cap reached"} · day resets at midnight ({d.limits.timezone})</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Connected Gmail account</CardTitle>
              <CardDescription>Emails are sent from this address.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {d.gmail ? (
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary"><Mail className="size-4" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.gmail.email}</p>
                  <p className={`text-xs ${gmailOk ? "text-success" : "text-destructive"}`}>{gmailOk ? "Connected" : d.gmail.status === "revoked" ? "Access revoked" : "Needs attention"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No account connected. <Link href="/gmail" className="font-medium text-primary hover:underline">Connect Gmail</Link></p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Emails sent, last 14 days</CardTitle>
              <CardDescription>{d.series.reduce((a, b) => a + b.count, 0)} sent in this period</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div role="img" aria-label={`Bar chart of emails sent per day. ${d.series.map((s) => `${s.date}: ${s.count}`).join(", ")}`} className="flex h-40 items-end gap-1.5">
              {d.series.map((s) => (
                <div key={s.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${s.date}: ${s.count} sent`}>
                  <span className="text-[11px] text-muted-foreground">{s.count > 0 ? s.count : ""}</span>
                  <div className={`w-full rounded-t-[3px] ${s.count > 0 ? "bg-primary" : "bg-muted"}`} style={{ height: `${Math.max(s.count > 0 ? 6 : 3, (s.count / maxDay) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
              <span>{d.series[0].date.slice(5)}</span>
              <span>{d.series[d.series.length - 1].date.slice(5)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Application statistics</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-2 text-[13px] font-medium">By category</p>
              <ul className="space-y-2">
                {CATEGORIES.map((c) => (
                  <li key={c} className="text-[13px]">
                    <div className="mb-1 flex justify-between"><span>{CATEGORY_LABELS[c]}</span><span className="text-muted-foreground">{d.categoryCounts[c]}</span></div>
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(d.categoryCounts[c] / maxCat) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium">By status</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.filter((s) => d.statusCounts[s] > 0).map((s) => <Pill key={s}>{STATUS_LABELS[s]} · {d.statusCounts[s]}</Pill>)}
                {d.totals.total === 0 && <span className="text-[13px] text-muted-foreground">Nothing yet</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent applications</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link href="/history">View all</Link></Button>
        </CardHeader>
        {recent.length === 0 ? (
          <EmptyState icon={Inbox} title="No applications yet" description="Upload a screenshot or type a recruiter’s email to prepare your first application." action={<Button asChild><Link href="/applications/new"><FilePlus2 /> New application</Link></Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[13px] text-muted-foreground">
                <tr><th className="px-5 py-2.5 font-medium">Recipient</th><th className="px-3 py-2.5 font-medium">Category</th><th className="hidden px-3 py-2.5 font-medium md:table-cell">Subject</th><th className="px-3 py-2.5 font-medium">Status</th><th className="hidden px-5 py-2.5 font-medium sm:table-cell">Date</th></tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="max-w-[220px] truncate px-5 py-3 font-medium">{r.recipientEmail}</td>
                    <td className="px-3 py-3">{CATEGORY_LABELS[r.category]}</td>
                    <td className="hidden max-w-[260px] truncate px-3 py-3 text-muted-foreground md:table-cell">{r.subject}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-muted-foreground sm:table-cell">{formatDateTime(r.appliedAt ?? r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
