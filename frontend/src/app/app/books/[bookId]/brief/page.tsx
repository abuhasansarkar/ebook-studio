import { Suspense } from "react";
import { BriefScreen } from "@/components/books/brief-screen";
import { PageLoader } from "@/components/ui/misc";

export default function Page({ params }: PageProps<"/app/books/[bookId]/brief">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <BriefScreen params={params} />
    </Suspense>
  );
}
