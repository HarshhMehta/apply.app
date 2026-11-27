"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AtSign, FileWarning, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Pill } from "@/components/ui/status-badge";
import { Notice, ErrorState, ListSkeleton } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { ScreenshotUpload } from "./screenshot-upload";
import { DraftCard, type Draft } from "./draft-card";
import { api, errorMessage } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/constants";
import { isValidEmail, normalizeEmail } from "@/lib/email/extract";
import type { DuplicateInfo, ResumeDTO, TemplateDTO } from "@/lib/types";

type Recipient = { email: string; companyName: string; recruiterName: string };

export function NewApplication() {
  const router = useRouter();
  const templates = useFetch<{ items: TemplateDTO[] }>("/api/templates");
  const resumes = useFetch<{ items: ResumeDTO[] }>("/api/resumes");
  const profile = useFetch<{ profile: { candidateName: string } }>("/api/profile");
  const gmail = useFetch<{ connection: { email: string } | null }>("/api/gmail/status");

  const [recipients, setRecipients] = React.useState<Recipient[]>([]);
  const [emailInput, setEmailInput] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [dupes, setDupes] = React.useState<Record<string, DuplicateInfo>>({});

  const [category, setCategory] = React.useState<Category>("fullstack");
  const [templateId, setTemplateId] = React.useState("");
  const [jobRole, setJobRole] = React.useState("");
  const [roleTouched, setRoleTouched] = React.useState(false);
  const [resumeId, setResumeId] = React.useState("");

  const [drafts, setDrafts] = React.useState<Draft[] | null>(null);
  const [batchId, setBatchId] = React.useState<string | undefined>();
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState<null | "pending_review" | "draft">(null);

  const tpls = React.useMemo(() => (templates.data?.items ?? []).filter((t) => t.isActive && t.category === category), [templates.data, category]);
  const resumeList = React.useMemo(() => resumes.data?.items ?? [], [resumes.data]);
  const template = tpls.find((t) => t.id === templateId);
  const emailSet = React.useMemo(() => new Set(recipients.map((r) => r.email)), [recipients]);

  // Pick the default template for the category, then its preferred resume (or the default resume).
  React.useEffect(() => {
    if (!tpls.length) { setTemplateId(""); return; }
    if (!tpls.some((t) => t.id === templateId)) setTemplateId((tpls.find((t) => t.isDefault) ?? tpls[0]).id);
  }, [tpls, templateId]);
  React.useEffect(() => {
    if (!resumes.data) return;
    const preferred = template?.preferredResumeId && resumeList.some((r) => r.id === template.preferredResumeId) ? template.preferredResumeId : null;
    setResumeId(preferred ?? resumeList.find((r) => r.isDefault)?.id ?? "");
  }, [template?.id, template?.preferredResumeId, resumes.data, resumeList]);
  React.useEffect(() => {
    if (!roleTouched) setJobRole(category === "custom" ? "" : CATEGORY_LABELS[category]);
  }, [category, roleTouched]);

  // Flag recipients we've already applied to or queued.
  React.useEffect(() => {
    const emails = recipients.map((r) => r.email);
    if (!emails.length) { setDupes({}); return; }
    let live = true;
    api<{ duplicates: DuplicateInfo[] }>("/api/applications/duplicates", { method: "POST", body: { emails } })
      .then((r) => live && setDupes(Object.fromEntries(r.duplicates.map((d) => [d.email, d]))))
      .catch(() => undefined);
    return () => { live = false; };
  }, [recipients]);

  function addEmails(list: string[]) {
    const added: string[] = [];
    let skipped = 0;
    setRecipients((prev) => {
      const next = [...prev];
      for (const raw of list) {
        const email = normalizeEmail(raw);
        if (!isValidEmail(email) || next.some((r) => r.email === email)) { skipped++; continue; }
        next.push({ email, companyName: "", recruiterName: "" });
        added.push(email);
      }
      return next;
    });
    setDrafts(null);
    return { added, skipped };
  }

  function submitManual() {
    const email = normalizeEmail(emailInput);
    if (!email) return setEmailError("Enter an email address");
    if (!isValidEmail(email)) return setEmailError("That doesn’t look like a valid email address");
    if (emailSet.has(email)) return setEmailError("Already in this batch");
    addEmails([email]);
    setEmailInput("");
    setEmailError(null);
  }

  const noTemplate = !templates.loading && tpls.length === 0;
  const missingRole = category === "custom" && !jobRole.trim();
  const canGenerate = recipients.length > 0 && !!templateId && !missingRole;

  async function generate() {
    setGenerating(true);
    try {
      const res = await api<{ drafts: Omit<Draft, "key">[] }>("/api/compose/preview", {
        method: "POST",
        body: {
          templateId,
          category,
          jobRole: jobRole.trim() || undefined,
          resumeId: resumeId || null,
          recipients: recipients.map((r) => ({ email: r.email, companyName: r.companyName.trim() || undefined, recruiterName: r.recruiterName.trim() || undefined })),
        },
      });
      setBatchId(crypto.randomUUID());
      setDrafts(res.drafts.map((d, i) => {
        const dup = dupes[d.email];
        return { ...d, key: `${d.email}-${i}`, resumeId: resumeId || d.resumeId, skipReason: dup?.blocking ? (dup.status === "sent" ? "Already applied" : "Already in queue") : undefined };
      }));
      requestAnimationFrame(() => document.getElementById("drafts")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  }

  const sendable = (drafts ?? []).filter((d) => !d.skipReason);
  const invalid = sendable.some((d) => !isValidEmail(d.email) || !d.subject.trim() || !d.body.trim());
  const dupInDrafts = new Set(sendable.map((d) => normalizeEmail(d.email))).size !== sendable.length;

  async function save(mode: "pending_review" | "draft") {
    setSaving(mode);
    try {
      const res = await api<{ created: unknown[]; skipped: { email: string; reason: string }[] }>("/api/queue", {
        method: "POST",
        body: {
          mode,
          batchId,
          items: sendable.map((d) => ({
            recipientEmail: d.email, category, templateId: templateId || null, resumeId: d.resumeId, jobRole: d.jobRole || undefined,
            companyName: d.companyName || undefined, recruiterName: d.recruiterName || undefined, subject: d.subject, body: d.body,
          })),
        },
      });
      if (res.created.length) toast.success(mode === "draft" ? `Saved ${res.created.length} draft${res.created.length === 1 ? "" : "s"}` : `${res.created.length} email${res.created.length === 1 ? "" : "s"} added to the review queue`);
      if (res.skipped.length) toast.warning(`Skipped ${res.skipped.length}: ${res.skipped.slice(0, 3).map((s) => `${s.email} (${s.reason})`).join("; ")}`, { duration: 9000 });
      if (res.created.length) router.push(mode === "draft" ? "/review?tab=draft" : "/review");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  if (templates.error || resumes.error) return <ErrorState message={(templates.error || resumes.error)!} onRetry={() => { void templates.reload(); void resumes.reload(); }} />;

  return (
    <>
      <PageHeader title="New application" description="Add recruiter emails, choose a template, then review each draft. Nothing is sent until you approve it in the review queue." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>1. Find the email</CardTitle><CardDescription>Upload a screenshot of the job post, or type the address.</CardDescription></div></CardHeader>
          <CardContent>
            <ScreenshotUpload
              alreadyAdded={emailSet}
              onSingle={(e) => { setEmailInput(e); setEmailError(null); }}
              onAdd={(list) => { const r = addEmails(list); if (r.added.length) toast.success(`Added ${r.added.length} email${r.added.length === 1 ? "" : "s"}`); }}
            />
            <form className="mt-5" onSubmit={(e) => { e.preventDefault(); submitManual(); }} noValidate>
              <Field id="email-input" label="Recruiter email" error={emailError ?? undefined} hint="Press Enter to add. Add as many as you need to this batch.">
                <div className="flex gap-2">
                  <Input id="email-input" type="email" inputMode="email" autoComplete="off" placeholder="name@company.com" value={emailInput} aria-invalid={!!emailError} onChange={(e) => { setEmailInput(e.target.value); setEmailError(null); }} />
                  <Button type="submit"><Plus /> Add email</Button>
                </div>
              </Field>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>2. Emails in this batch</CardTitle><CardDescription>{recipients.length ? `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}. Company and recruiter name are optional.` : "Nothing added yet."}</CardDescription></div>
            {recipients.length > 0 && <Button variant="ghost" size="sm" onClick={() => { setRecipients([]); setDrafts(null); }}><Trash2 /> Clear all</Button>}
          </CardHeader>
          {recipients.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center text-sm text-muted-foreground"><AtSign className="mb-2 size-6" />Added emails appear here.</div>
          ) : (
            <ul className="max-h-[420px] divide-y overflow-y-auto">
              {recipients.map((r, i) => {
                const d = dupes[r.email];
                return (
                  <li key={r.email} className="space-y-2 px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-medium">{r.email}</span>{d && <Pill className={d.blocking ? "bg-warning-soft text-warning" : ""}>{d.blocking ? (d.status === "sent" ? "Already applied" : "Already queued") : `Previously ${d.status.replace("_", " ")}`}</Pill>}</div>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.email}`} onClick={() => { setRecipients((p) => p.filter((x) => x.email !== r.email)); setDrafts(null); }}><X /></Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input aria-label={`Company for ${r.email}`} placeholder="Company (optional)" value={r.companyName} onChange={(e) => { const v = e.target.value; setRecipients((p) => p.map((x, j) => (j === i ? { ...x, companyName: v } : x))); setDrafts(null); }} />
                      <Input aria-label={`Recruiter name for ${r.email}`} placeholder="Recruiter name (optional)" value={r.recruiterName} onChange={(e) => { const v = e.target.value; setRecipients((p) => p.map((x, j) => (j === i ? { ...x, recruiterName: v } : x))); setDrafts(null); }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader><div><CardTitle>3. Template and resume</CardTitle><CardDescription>Choose how the email is written and what’s attached.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          {templates.loading || resumes.loading ? <ListSkeleton rows={2} /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field id="category" label="Application category">
                  <Select id="category" value={category} onChange={(e) => { setCategory(e.target.value as Category); setDrafts(null); }}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </Select>
                </Field>
                <Field id="template" label="Email template" error={noTemplate ? "No active template in this category" : undefined}>
                  <Select id="template" value={templateId} disabled={noTemplate} onChange={(e) => { setTemplateId(e.target.value); setDrafts(null); }}>
                    {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
                  </Select>
                </Field>
                <Field id="job-role" label="Job role" error={missingRole ? "Enter the role you’re applying for" : undefined}>
                  <Input id="job-role" value={jobRole} placeholder="e.g. React Developer" maxLength={120} onChange={(e) => { setJobRole(e.target.value); setRoleTouched(true); setDrafts(null); }} />
                </Field>
                <Field id="resume" label="Resume">
                  <Select id="resume" value={resumeId} onChange={(e) => { setResumeId(e.target.value); setDrafts(null); }}>
                    <option value="">No attachment</option>
                    {resumeList.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isDefault ? " (default)" : ""}</option>)}
                  </Select>
                </Field>
              </div>
              {noTemplate && <Notice tone="warning">Activate or create a {CATEGORY_LABELS[category]} template in <Link href="/templates" className="font-medium underline">Email templates</Link>.</Notice>}
              {resumeList.length === 0 && <Notice tone="warning" title="No resume uploaded"><span className="inline-flex items-center gap-1.5"><FileWarning className="size-4" />Emails will go out without an attachment. <Link href="/resumes" className="font-medium underline">Upload a resume</Link></span></Notice>}
              {profile.data && !profile.data.profile.candidateName && <Notice tone="info">Your name isn’t set, so signatures will be blank. Add it under <Link href="/settings" className="font-medium underline">Settings → Candidate profile</Link>.</Notice>}
              <div className="flex justify-end"><Button onClick={generate} loading={generating} disabled={!canGenerate}><Sparkles /> Generate drafts</Button></div>
            </>
          )}
        </CardContent>
      </Card>

      {drafts && (
        <section id="drafts" className="mt-8 scroll-mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold">4. Review drafts</h2><p className="text-sm text-muted-foreground">Edit anything you like. These go to the review queue first; nothing is sent from here.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!sendable.length || invalid || dupInDrafts} loading={saving === "draft"} onClick={() => save("draft")}>Save as drafts</Button>
              <Button disabled={!sendable.length || invalid || dupInDrafts} loading={saving === "pending_review"} onClick={() => save("pending_review")}>Add {sendable.length} to review queue</Button>
            </div>
          </div>
          {dupInDrafts && <div className="mb-4"><Notice tone="error">Two drafts have the same recipient. Remove one before continuing.</Notice></div>}
          {invalid && <div className="mb-4"><Notice tone="error">Fix the highlighted drafts: each needs a valid recipient, a subject and a message.</Notice></div>}
          {sendable.length === 0 && <div className="mb-4"><Notice tone="warning">Every recipient here was already applied to or queued, so there’s nothing new to add.</Notice></div>}
          <div className="space-y-4">
            {drafts.map((d, i) => (
              <DraftCard key={d.key} draft={d} index={i} resumes={resumeList} from={gmail.data?.connection?.email ?? "Your Gmail address"}
                onChange={(patch) => setDrafts((p) => p!.map((x) => (x.key === d.key ? { ...x, ...patch } : x)))}
                onRemove={() => setDrafts((p) => p!.filter((x) => x.key !== d.key))} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
