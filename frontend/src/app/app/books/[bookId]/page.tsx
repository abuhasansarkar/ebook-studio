import { Suspense } from "react";
import { BookRedirect } from "@/components/books/book-redirect";
import { PageLoader } from "@/components/ui/misc";

export default function BookIndexPage({ params }: PageProps<"/app/books/[bookId]">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <BookRedirect params={params} />
    </Suspense>
  );
}
