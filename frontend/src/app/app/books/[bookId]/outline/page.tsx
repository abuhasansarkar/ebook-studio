import { Suspense } from "react";
import { OutlineScreen } from "@/components/books/outline-screen";
import { PageLoader } from "@/components/ui/misc";

export default function Page({ params }: PageProps<"/app/books/[bookId]/outline">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <OutlineScreen params={params} />
    </Suspense>
  );
}
