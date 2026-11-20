"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { authClient, signOut, useSession } from "@/lib/auth-client";

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, refetch } = useSession();
  const [name, setName] = useState(session?.user.name ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <PageHeader title="Settings" description="Manage your profile and session." />
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Profile</h2>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim().length < 2) return toast.error("Please enter your name");
            setSaving(true);
            const { error } = await authClient.updateUser({ name: name.trim() });
            setSaving(false);
            if (error) return toast.error(error.message ?? "Could not save");
            await refetch();
            toast.success("Profile saved");
          }}
        >
          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="email" hint="Email changes aren't available yet.">
            <Input id="email" value={session?.user.email ?? ""} disabled />
          </Field>
          <Button type="submit" loading={saving} disabled={name.trim() === session?.user.name}>
            Save changes
          </Button>
        </form>
      </Card>
      <Card className="mt-6 flex items-center justify-between p-6">
        <div>
          <h2 className="font-semibold">Log out</h2>
          <p className="text-sm text-muted-foreground">End your session on this device.</p>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          Log out
        </Button>
      </Card>
    </div>
  );
}
