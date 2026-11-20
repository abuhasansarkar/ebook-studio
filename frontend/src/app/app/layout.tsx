import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { PageLoader } from "@/components/ui/misc";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  // The shell reads the URL and the session on the client, so it streams in behind a boundary.
  return (
    <Suspense fallback={<PageLoader label="Loading your studio…" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
