"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/form";
import { Alert, Card, DetailList, DetailRow, Section } from "@/components/ui/misc";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
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

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== "DELETE") return;
    setDeleting(true);
    try {
      await api.delete("/users/me");
      await signOut();
      toast.success("Account permanently deleted");
      router.replace("/signup");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete account";
      toast.error(msg);
      setDeleting(false);
    }
  };

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

        <Section title="Danger Zone" description="Irreversible actions regarding your account.">
          <Card className="border-danger/30 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-danger flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
                  Delete account
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permanently delete your profile, books, generations, and assets.
                  <strong className="text-foreground"> Once deleted, this email cannot be reused.</strong>
                </p>
              </div>
              <Button
                variant="danger"
                onClick={() => setConfirmDelete(true)}
                data-testid="delete-account-button"
              >
                Delete account
              </Button>
            </div>
          </Card>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setDeleteConfirmationText("");
        }}
        onConfirm={handleDeleteAccount}
        title="Delete account permanently"
        description="This action cannot be undone."
        confirmLabel="Delete my account"
        tone="danger"
        busy={deleting}
        confirmDisabled={deleteConfirmationText !== "DELETE"}
      >
        <p className="font-semibold text-foreground">Are you sure you want to delete your account?</p>
        <ul className="mt-2 list-disc pl-4 space-y-1 text-xs text-muted-foreground">
          <li>All your books, chapters, and assets will be permanently deleted.</li>
          <li>Remaining wallet credits will be forfeited.</li>
          <li>
            <strong className="text-danger">Your email ({session?.user.email}) will be permanently tombstoned</strong> and cannot be used to register a new account.
          </li>
        </ul>
        <div className="mt-3">
          <p className="text-xs font-medium text-foreground mb-1">
            Type <span className="font-mono font-bold text-danger">DELETE</span> to confirm:
          </p>
          <Input
            value={deleteConfirmationText}
            onChange={(e) => setDeleteConfirmationText(e.target.value)}
            placeholder="DELETE"
            className="h-9 text-xs"
          />
        </div>
      </ConfirmDialog>
    </div>
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
