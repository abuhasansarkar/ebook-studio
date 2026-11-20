"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthHeader } from "@/components/auth/auth-ui";
import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <AuthHeader title="Choose a new password" subtitle="Enter the code we emailed you and your new password." />
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (otp.length !== 6) return setError("Enter the 6-digit code from your email.");
          if (password.length < 8) return setError("Your new password needs at least 8 characters.");
          if (password !== confirm) return setError("The passwords don't match.");
          setError(null);
          setLoading(true);
          const { error } = await authClient.emailOtp.resetPassword({ email: email.trim(), otp, password });
          setLoading(false);
          if (error) return setError(error.message ?? "Could not reset your password");
          router.replace("/login?reset=1");
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div>
          <Label>Reset code</Label>
          <OtpInput value={otp} onChange={setOtp} />
        </div>
        <Field label="New password" htmlFor="password" hint="At least 8 characters">
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Update password
        </Button>
      </form>
      <Link href="/forgot-password" className="mt-6 block text-center text-sm font-semibold text-primary-hover hover:underline">
        Send a new code
      </Link>
    </>
  );
}
