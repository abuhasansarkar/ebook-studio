"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AuthHeader, InboxHint, otpErrorMessage, safeNext } from "@/components/auth/auth-ui";
import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { authClient, useSession } from "@/lib/auth-client";

export function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const next = safeNext(params.get("next"));
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(30);
  // A ref, not state: auto-submit on the sixth digit and a press of Enter can
  // land in the same tick, before a state update would be seen.
  const inFlight = useRef(false);
  const { refetch: refetchSession } = useSession();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!email) {
    return (
      <>
        <AuthHeader title="Verify your email" />
        <Alert tone="warning">The verification link is missing an email address.</Alert>
        <Link href="/signup" className="mt-6 block text-center text-sm font-semibold text-primary-hover hover:underline">Back to sign up</Link>
      </>
    );
  }

  const verify = async (code: string) => {
    if (code.length !== 6) return setError("Enter the 6-digit code from your email.");
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setVerifying(true);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp: code });
    setVerifying(false);
    inFlight.current = false;
    if (error) {
      setError(otpErrorMessage(error));
      setOtp("");
      return;
    }
    toast.success("Email verified — welcome to eBookStudio!");
    // Verification signs the author in; load that session before entering the
    // app so the shell never sees a stale "signed out" value.
    await refetchSession();
    router.replace(next);
    router.refresh();
  };

  return (
    <>
      <AuthHeader title="Check your email" subtitle={`A 6-digit code was requested for ${email}. It expires 10 minutes after the request. Delivery may take a moment.`} />
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(otp);
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        <OtpInput
          value={otp}
          disabled={verifying}
          onChange={(v) => {
            setOtp(v);
            if (v.length === 6) void verify(v);
          }}
        />
        <Button type="submit" className="w-full" size="lg" loading={verifying}>
          Verify email
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Didn&apos;t get it?{" "}
        <button
          type="button"
          disabled={cooldown > 0 || resending}
          className="cursor-pointer font-semibold text-primary-hover hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          onClick={async () => {
            setResending(true);
            const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
            setResending(false);
            if (error) {
              if (error.status === 429) setCooldown(60);
              return toast.error(otpErrorMessage(error));
            }
            toast.success("A new code was requested. Use the latest code you receive.");
            setCooldown(30);
          }}
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </p>
      <InboxHint />
    </>
  );
}
