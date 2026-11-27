"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { History as HistoryIcon, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime } from "@/components/ui/format";
import { useFetch } from "@/hooks/use-fetch";
import { CATEGORIES, CATEGORY_LABELS, STATUSES, STATUS_LABELS } from "@/lib/constants";
import type { ApplicationDTO } from "@/lib/types";

type Res = { items: ApplicationDTO[]; total: number; page: number; pages: number; pageSize: number };

function Inner() {
  const params = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(STATUSES.find((s) => s === params.get("status")) ?? "");
  const [category, setCategory] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (q) qs.set("search", q);
  if (status) qs.set("status", status);
  if (category) qs.set("category", category);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, error, loading, reload } = useFetch<Res>(`/api/applications?${qs}`);
  const filtered = !!(q || status || category || from || to);
  const reset = () => { setSearch(""); setQ(""); setStatus(""); setCategory(""); setFrom(""); setTo(""); setPage(1); };
  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader title="Application history" description="Every application you’ve prepared or sent, with its current status." />
      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Search" placeholder="Search email, subject, company, message ID" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Filter by status" value={status} onChange={(e) => set(setStatus)(e.target.value as typeof status)}>
            <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
          <Select aria-label="Filter by category" value={category} onChange={(e) => set(setCategory)(e.target.value)}>
            <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </Select>
          <Input aria-label="From date" type="date" value={from} max={to || undefined} onChange={(e) => set(setFrom)(e.target.value)} />
          <Input aria-label="To date" type="date" value={to} min={from || undefined} onChange={(e) => set(setTo)(e.target.value)} />
          <Button variant="ghost" onClick={reset} disabled={!filtered}>Clear</Button>
        </div>

        {loading && !data ? <ListSkeleton rows={8} /> : error ? <ErrorState message={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
          <EmptyState icon={HistoryIcon} title={filtered ? "No applications match these filters" : "No applications yet"} description={filtered ? "Adjust or clear the filters." : "Applications appear here as soon as you prepare them."} action={filtered ? <Button variant="outline" onClick={reset}>Clear filters</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-[13px] text-muted-foreground">
                <tr>{["Recipient", "Category", "Subject", "Resume used", "Date", "Status", "Gmail message ID"].map((h) => <th key={h} className="px-3 py-2.5 font-medium first:pl-5 last:pr-5">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="max-w-[210px] truncate py-3 pl-5 pr-3 font-medium">{a.recipientEmail}</td>
                    <td className="whitespace-nowrap px-3 py-3">{CATEGORY_LABELS[a.category]}</td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-muted-foreground">{a.subject}</td>
                    <td className="max-w-[140px] truncate px-3 py-3 text-muted-foreground">{a.resumeName || "None"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDateTime(a.appliedAt ?? a.createdAt)}</td>
                    <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
                    <td className="max-w-[160px] truncate py-3 pl-3 pr-5 font-mono text-xs text-muted-foreground">{a.gmailMessageId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
      </Card>
    </>
  );
}

export function History() {
  return <React.Suspense fallback={<ListSkeleton rows={8} />}><Inner /></React.Suspense>;
}
