import { Suspense } from "react";
import { ColoringHeader } from "@/components/coloring/coloring-header";
import { PageLoader } from "@/components/ui/misc";

export default function ColoringBookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ bookId: string }>;
}) {
  return (
    <Suspense fallback={<PageLoader label="Loading coloring studio…" />}>
      <ColoringHeader params={params} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8" suppressHydrationWarning>
        {children}
      </div>
    </Suspense>
  );
}
