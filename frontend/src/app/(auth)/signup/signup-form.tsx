"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { AuthHeader, GoogleButton, safeNext } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});
type Values = z.infer<typeof schema>;

export function SignupForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    const { error } = await authClient.signUp.email({ name: v.name, email: v.email, password: v.password });
    if (error) {
      setServerError(error.message ?? "Could not create your account");
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(v.email)}&next=${encodeURIComponent(next)}`);
  });

  return (
    <>
      <AuthHeader title="Create your account" subtitle="Start with 100 free credits. No credit card needed." />
      <GoogleButton next={next} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <Field label="Name" htmlFor="name" error={formState.errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!formState.errors.name} {...register("name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message} hint="At least 8 characters">
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!formState.errors.password} {...register("password")} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-primary-hover hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
