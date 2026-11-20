import { Suspense } from "react";
import { EditorScreen } from "@/components/books/editor-screen";
import { PageLoader } from "@/components/ui/misc";

export default function Page({ params }: PageProps<"/app/books/[bookId]/editor">) {
  return (
    <Suspense fallback={<PageLoader />}>
      <EditorScreen params={params} />
    </Suspense>
  );
}
