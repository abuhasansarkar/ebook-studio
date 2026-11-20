import { Suspense } from "react";
import { GenerateScreen } from "@/components/books/generate-screen";
import { PageLoader } from "@/components/ui/misc";

export default function Page({ params }: PageProps<"/app/books/[bookId]/generate">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <GenerateScreen params={params} />
    </Suspense>
  );
}
