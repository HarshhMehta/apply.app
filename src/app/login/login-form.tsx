"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api-client";

const schema = z.object({ email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"), password: z.string().min(1, "Enter your password") });
type Values = z.infer<typeof schema>;

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return (
    <form
      className="mt-5 space-y-4"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        setError(null);
        try {
          await api("/api/auth/login", { method: "POST", body: values });
          router.replace(safeNext);
          router.refresh();
        } catch (e) {
          setError(errorMessage(e));
        }
      })}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" autoFocus aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
