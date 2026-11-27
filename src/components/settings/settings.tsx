"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, ListSkeleton, Notice } from "@/components/ui/states";
import { formatDateTime } from "@/components/ui/format";
import { api, errorMessage, ApiClientError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";

type Profile = { candidateName: string; professionalEmail: string; phone: string; currentTitle: string; yearsOfExperience: number | null; primarySkills: string[]; secondarySkills: string[]; preferredRoles: string[]; preferredLocations: string[]; portfolioUrl: string; linkedinUrl: string; githubUrl: string };
type FormValues = Omit<Profile, "primarySkills" | "secondarySkills" | "preferredRoles" | "preferredLocations" | "yearsOfExperience"> & { yearsOfExperience: string; primarySkills: string; secondarySkills: string; preferredRoles: string; preferredLocations: string };
const toList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function ProfileCard() {
  const { data, error, loading, reload } = useFetch<{ profile: Profile }>("/api/profile");
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting, isDirty } } = useForm<FormValues>();

  React.useEffect(() => {
    if (data) {
      const p = data.profile;
      reset({ ...p, yearsOfExperience: p.yearsOfExperience == null ? "" : String(p.yearsOfExperience), primarySkills: p.primarySkills.join(", "), secondarySkills: p.secondarySkills.join(", "), preferredRoles: p.preferredRoles.join(", "), preferredLocations: p.preferredLocations.join(", ") });
    }
  }, [data, reset]);

  const save = handleSubmit(async (v) => {
    const years = v.yearsOfExperience.trim();
    if (years && (Number.isNaN(Number(years)) || Number(years) < 0 || Number(years) > 60)) return setError("yearsOfExperience", { message: "Enter a number between 0 and 60" });
    try {
      await api("/api/profile", { method: "PUT", body: { ...v, yearsOfExperience: years ? Number(years) : null, primarySkills: toList(v.primarySkills), secondarySkills: toList(v.secondarySkills), preferredRoles: toList(v.preferredRoles), preferredLocations: toList(v.preferredLocations) } });
      toast.success("Profile saved");
      await reload();
    } catch (e) {
      if (e instanceof ApiClientError && e.details) for (const [k, m] of Object.entries(e.details)) setError(k as keyof FormValues, { message: m });
      toast.error(errorMessage(e));
    }
  });

  return (
    <Card>
      <CardHeader><div><CardTitle>Candidate profile</CardTitle><CardDescription>Optional details your templates can use. Nothing is filled in for you, and empty fields are left out of emails.</CardDescription></div></CardHeader>
      {loading && !data ? <ListSkeleton rows={4} /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <form onSubmit={save} noValidate>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="p-name" label="Candidate name" error={errors.candidateName?.message}><Input id="p-name" autoComplete="name" {...register("candidateName")} /></Field>
            <Field id="p-email" label="Professional email" error={errors.professionalEmail?.message}><Input id="p-email" type="email" autoComplete="email" {...register("professionalEmail")} /></Field>
            <Field id="p-phone" label="Phone number" error={errors.phone?.message}><Input id="p-phone" type="tel" autoComplete="tel" {...register("phone")} /></Field>
            <Field id="p-title" label="Current job title" error={errors.currentTitle?.message}><Input id="p-title" {...register("currentTitle")} /></Field>
            <Field id="p-years" label="Years of experience" error={errors.yearsOfExperience?.message}><Input id="p-years" inputMode="decimal" {...register("yearsOfExperience")} /></Field>
            <div className="hidden sm:block" />
            <Field id="p-primary" label="Primary skills" hint="Separate with commas." error={errors.primarySkills?.message}><Input id="p-primary" {...register("primarySkills")} /></Field>
            <Field id="p-secondary" label="Secondary skills" hint="Separate with commas." error={errors.secondarySkills?.message}><Input id="p-secondary" {...register("secondarySkills")} /></Field>
            <Field id="p-roles" label="Preferred job roles" hint="Separate with commas." error={errors.preferredRoles?.message}><Input id="p-roles" {...register("preferredRoles")} /></Field>
            <Field id="p-loc" label="Preferred locations" hint="Separate with commas." error={errors.preferredLocations?.message}><Input id="p-loc" {...register("preferredLocations")} /></Field>
            <Field id="p-web" label="Portfolio URL" error={errors.portfolioUrl?.message}><Input id="p-web" type="url" placeholder="https://" {...register("portfolioUrl")} /></Field>
            <Field id="p-li" label="LinkedIn URL" error={errors.linkedinUrl?.message}><Input id="p-li" type="url" placeholder="https://" {...register("linkedinUrl")} /></Field>
            <Field id="p-gh" label="GitHub URL" error={errors.githubUrl?.message}><Input id="p-gh" type="url" placeholder="https://" {...register("githubUrl")} /></Field>
          </CardContent>
          <div className="flex justify-end border-t px-5 py-3"><Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save profile</Button></div>
        </form>
      )}
    </Card>
  );
}

type SettingsRes = { settings: { dailyCap: number; sendIntervalMs: number; maxRetries: number; timezone: string }; usage: { used: number }; block: { until: string; reason: string | null } | null };

function LimitsCard() {
  const { data, error, loading, reload } = useFetch<SettingsRes>("/api/settings");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<{ dailyCap: string; sendIntervalSec: string; maxRetries: string; timezone: string }>();
  const [clearing, setClearing] = React.useState(false);

  React.useEffect(() => { if (data) reset({ dailyCap: String(data.settings.dailyCap), sendIntervalSec: String(data.settings.sendIntervalMs / 1000), maxRetries: String(data.settings.maxRetries), timezone: data.settings.timezone }); }, [data, reset]);

  const save = handleSubmit(async (v) => {
    try {
      await api("/api/settings", { method: "PUT", body: { dailyCap: Number(v.dailyCap), sendIntervalMs: Math.round(Number(v.sendIntervalSec) * 1000), maxRetries: Number(v.maxRetries), timezone: v.timezone.trim() } });
      toast.success("Sending limits saved");
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const cap = Number(data?.settings.dailyCap ?? 0);
  return (
    <Card>
      <CardHeader><div><CardTitle>Sending limits</CardTitle><CardDescription>Your own safety limits. Gmail enforces its own, and they can be lower than yours.</CardDescription></div>{data && <p className="text-sm text-muted-foreground">Sent today: <span className="font-semibold text-foreground">{data.usage.used}</span> / {cap}</p>}</CardHeader>
      {loading && !data ? <ListSkeleton rows={2} /> : error ? <ErrorState message={error} onRetry={reload} /> : (
        <form onSubmit={save} noValidate>
          <CardContent className="space-y-4">
            {data?.block && (
              <Notice tone="warning" title="Sending is paused" action={<Button size="sm" variant="outline" loading={clearing} onClick={async () => { setClearing(true); try { await api("/api/settings/clear-block", { method: "POST" }); toast.success("Sending can resume"); await reload(); } catch (e) { toast.error(errorMessage(e)); } finally { setClearing(false); } }}>Resume sending</Button>}>
                {data.block.reason} Paused until {formatDateTime(data.block.until)}.
              </Notice>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="s-cap" label="Daily application cap" hint="Emails per day. Personal Gmail accounts commonly allow about 500 recipients a day, and new or low-reputation accounts often far fewer." error={errors.dailyCap?.message}>
                <Input id="s-cap" type="number" min={1} max={2000} {...register("dailyCap", { required: "Enter a number", min: { value: 1, message: "At least 1" }, max: { value: 2000, message: "At most 2000" } })} />
              </Field>
              <Field id="s-tz" label="Time zone" hint="The daily cap resets at midnight in this zone, e.g. Asia/Kolkata or America/New_York." error={errors.timezone?.message}>
                <Input id="s-tz" {...register("timezone", { required: "Enter a time zone" })} />
              </Field>
              <Field id="s-int" label="Pause between emails (seconds)" hint="Between 0.5 and 60." error={errors.sendIntervalSec?.message}>
                <Input id="s-int" type="number" step="0.5" min={0.5} max={60} {...register("sendIntervalSec", { required: "Enter a number", min: { value: 0.5, message: "At least 0.5" }, max: { value: 60, message: "At most 60" } })} />
              </Field>
              <Field id="s-retry" label="Retries for temporary Gmail errors" hint="0 to 5. Successful sends are never retried." error={errors.maxRetries?.message}>
                <Input id="s-retry" type="number" min={0} max={5} {...register("maxRetries", { required: "Enter a number", min: { value: 0, message: "At least 0" }, max: { value: 5, message: "At most 5" } })} />
              </Field>
            </div>
          </CardContent>
          <div className="flex justify-end border-t px-5 py-3"><Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save limits</Button></div>
        </form>
      )}
    </Card>
  );
}

export function Settings() {
  return (
    <>
      <PageHeader title="Settings" description="Your candidate profile and sending safety limits." />
      <div className="space-y-5"><ProfileCard /><LimitsCard /></div>
    </>
  );
}
