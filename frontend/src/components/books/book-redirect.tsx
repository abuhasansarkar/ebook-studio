"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { ErrorState, PageLoader } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useBook } from "@/lib/queries";

/** Sends the user to the step their book is currently at. */
export function BookRedirect({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const router = useRouter();
  const { data: book, error, refetch } = useBook(bookId);

  useEffect(() => {
    if (!book) return;
    const written = book.chapters.some((c) => c.status === "done");
    const step = book.activeJob?.type === "chapters" || book.status === "generating" ? "generate" : written ? "editor" : book.outline?.approvedAt ? "generate" : "outline";
    router.replace(`/app/books/${bookId}/${step}`);
  }, [book, bookId, router]);

  if (error) return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><ErrorState message={errorMessage(error)} onRetry={() => void refetch()} /></div>;
  return <PageLoader />;
}
