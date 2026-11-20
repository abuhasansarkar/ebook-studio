"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthHeader } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <AuthHeader title="Reset your password" subtitle="Enter your account email and we'll send you a 6-digit code." />
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address");
          setError(null);
          setLoading(true);
          const { error } = await authClient.emailOtp.requestPasswordReset({ email: email.trim() });
          setLoading(false);
          if (error) return setError(error.message ?? "Could not send the reset code");
          router.push(`/reset-password?email=${encodeURIComponent(email.trim())}`);
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Send reset code
        </Button>
      </form>
      <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-primary-hover hover:underline">
        Back to log in
      </Link>
    </>
  );
}
