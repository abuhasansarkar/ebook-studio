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
import { authClient, useSession } from "@/lib/auth-client";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [serverError, setServerError] = useState<string | null>(null);
  const { refetch: refetchSession } = useSession();
  const { register, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    const { error } = await authClient.signIn.email({ email: v.email, password: v.password });
    if (error) {
      if (error.status === 403 || error.code === "EMAIL_NOT_VERIFIED") {
        await authClient.emailOtp.sendVerificationOtp({ email: v.email, type: "email-verification" });
        router.push(`/verify-email?email=${encodeURIComponent(v.email)}&next=${encodeURIComponent(next)}`);
        return;
      }
      setServerError(error.message ?? "Invalid email or password");
      return;
    }
    // After a sign-out in this tab the client session store holds "no session".
    // The app shell would read that stale value and send the author straight
    // back here, so the new session is loaded before navigating.
    await refetchSession();
    router.replace(next);
    router.refresh();
  });

  return (
    <>
      <AuthHeader title="Welcome back" subtitle="Log in to continue writing." />
      {params.get("reset") === "1" && <Alert tone="success" className="mb-4">Password updated. Log in with your new password.</Alert>}
      <GoogleButton next={next} />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!formState.errors.password} {...register("password")} />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-primary-hover hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to eBookStudio?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-primary-hover hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
