import { Suspense } from "react";
import { BookHeader } from "@/components/books/book-header";
import { PageLoader } from "@/components/ui/misc";

export default function BookLayout({ children, params }: LayoutProps<"/app/books/[bookId]">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <BookHeader params={params} />
      {children}
    </Suspense>
  );
}
