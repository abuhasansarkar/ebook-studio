"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { usePublicConfig } from "@/lib/queries";

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** Only rendered when Google OAuth is configured on the server. */
export function GoogleButton({ next }: { next: string }) {
  const { data } = usePublicConfig();
  const [loading, setLoading] = useState(false);
  if (!data?.auth.google) return null;
  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          const { error } = await authClient.signIn.social({ provider: "google", callbackURL: next });
          if (error) {
            toast.error(error.message ?? "Google sign-in failed");
            setLoading(false);
          }
        }}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        Continue with Google
      </Button>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app/dashboard";
}
