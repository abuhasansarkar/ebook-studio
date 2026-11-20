import { Suspense } from "react";
import { ResearchWorkspace } from "@/components/research/research-workspace";
import { PageLoader } from "@/components/ui/misc";

export default function Page({ params }: PageProps<"/app/books/[bookId]/research">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ResearchWorkspace params={params} />
    </Suspense>
  );
}
