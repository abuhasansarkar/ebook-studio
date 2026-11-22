"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Card, DetailList, DetailRow, Section } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { useAccount } from "@/lib/queries";

/**
 * The Settings screen.
 *
 * Two things are shown side by side, and they are not the same thing:
 *
 * - The **profile** is editable. The name is the one field the product lets
 *   an author change.
 * - The **account record** is read-only. It is the server's own view of the
 *   account — the identifier, the address and whether the address is verified —
 *   and it is shown as it is rather than edited from a second copy of the same
 *   data.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { data: session, refetch } = useSession();
  const account = useAccount();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  // The session arrives after the first render, so the field is filled in once
  // it is known. It is seeded only once, so an edit in progress is never
  // overwritten by a session refresh.
  useEffect(() => {
    if (seeded.current || !session?.user.name) return;
    seeded.current = true;
    setName(session.user.name);
  }, [session?.user.name]);

  // The saved name and the name in the field start the same, so the button is
  // only enabled when there is something to save.
  const trimmed = name.trim();
  const unchanged = trimmed === (session?.user.name ?? "");
  const tooShort = trimmed.length > 0 && trimmed.length < 2;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <PageHeader title="Settings" description="Manage your profile, review your account, and end your session." />

      <div className="space-y-8">
        <Section title="Profile" description="How your name appears across the product.">
          <Card className="p-6">
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (tooShort) return toast.error("Please enter your name");
                setSaving(true);
                const { error } = await authClient.updateUser({ name: trimmed });
                setSaving(false);
                if (error) return toast.error(error.message ?? "Could not save");
                await refetch();
                // The account record on the server changed too, so it is read
                // again rather than left showing the previous name.
                await account.refetch();
                toast.success("Profile saved");
              }}
            >
              <Field label="Name" htmlFor="name" error={tooShort ? "Enter at least two characters." : undefined}>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  data-testid="profile-name"
                />
              </Field>
              <Field label="Email" htmlFor="email" hint="Email changes aren't available yet.">
                <Input id="email" value={session?.user.email ?? ""} disabled />
              </Field>
              <Button type="submit" loading={saving} disabled={unchanged || tooShort} data-testid="save-profile">
                Save changes
              </Button>
            </form>
          </Card>
        </Section>

        <AccountRecord />

        <Section title="Session" description="End your session on this device.">
          <Card className="flex items-center justify-between gap-4 p-6">
            <div className="min-w-0">
              <h2 className="font-semibold">Log out</h2>
              <p className="text-sm text-muted-foreground">
                You will need to sign in again to reach your books.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
              data-testid="log-out"
            >
              Log out
            </Button>
          </Card>
        </Section>

        <DeleteAccount email={session?.user.email ?? ""} />
      </div>
    </div>
  );
}

/**
 * Account deletion.
 *
 * Deleting removes the books, files and sign-in details. Payment and credit
 * records are kept, anonymised, because they are financial records. The author
 * types the account's email to confirm, and the server checks it again.
 */
function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = email.length > 0 && confirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <Section title="Delete account" description="Permanently remove your account and everything in it.">
      <Card className="space-y-4 border-danger/40 p-6" data-testid="delete-account">
        <p className="text-sm text-muted-foreground">
          This deletes your books, coloring books, covers and uploaded files, and signs you out everywhere. It cannot be
          undone. Payment and credit records are kept in anonymised form, as financial records must be. Cancel any active
          subscription first.
        </p>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!matches || deleting) return;
            setDeleting(true);
            setError(null);
            try {
              await api.delete("/users/me", { confirmEmail: confirm.trim() });
              toast.success("Your account was deleted");
              await signOut().catch(() => undefined);
              router.replace("/login");
            } catch (err) {
              setError(err instanceof ApiError || err instanceof Error ? err.message : "The account could not be deleted.");
              setDeleting(false);
            }
          }}
        >
          <Field label={`Type ${email || "your email"} to confirm`} htmlFor="confirm-delete">
            <Input
              id="confirm-delete"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-testid="confirm-delete"
            />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" variant="danger" loading={deleting} disabled={!matches} data-testid="delete-account-submit">
            Delete my account
          </Button>
        </form>
      </Card>
    </Section>
  );
}

/**
 * The account record.
 *
 * This is the product's own account endpoint, not the auth session. The
 * session says who is signed in; this says what the product knows about that
 * account, and it is the authority on whether the address is verified.
 */
function AccountRecord() {
  const account = useAccount();

  return (
    <Section title="Account" description="Your account as the product records it. These details are read-only.">
      {account.isPending ? (
        <Card className="p-6 text-sm text-muted-foreground">Reading your account…</Card>
      ) : account.error ? (
        <Alert tone="danger" data-testid="account-error">
          Your account details could not be read. {account.error.message}
        </Alert>
      ) : account.data ? (
        <Card className="overflow-hidden" data-testid="account-record">
          <DetailList>
            <DetailRow label="Name">
              <span className="inline-flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
                {account.data.name}
              </span>
            </DetailRow>
            <DetailRow label="Email">{account.data.email}</DetailRow>
            <DetailRow label="Email status">
              {account.data.emailVerified ? (
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-success" aria-hidden />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-warning" aria-hidden />
                  Not verified
                </span>
              )}
            </DetailRow>
            <DetailRow label="Account ID">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {account.data.id}
              </code>
            </DetailRow>
          </DetailList>
          {!account.data.emailVerified && (
            <div className="border-t border-border px-5 py-4">
              <Alert tone="warning">
                Your email address is not verified. Some features stay locked until it is.
              </Alert>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">No account details are available.</Card>
      )}
    </Section>
  );
}
