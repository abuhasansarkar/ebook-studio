import { Suspense } from "react";
import { ExportScreen } from "@/components/books/export-screen";
import { PageLoader } from "@/components/ui/misc";

export default function Page({ params }: PageProps<"/app/books/[bookId]/export">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ExportScreen params={params} />
    </Suspense>
  );
}
