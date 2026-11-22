"use client";

import { useParams } from "next/navigation";
import { Distribution } from "@/components/studio/distribution-screen";

/**
 * The distribution screen, reached from a book's tab.
 *
 * The screen itself lives at `/app/distribution?bookId=…` so it can also be
 * opened directly. This route only supplies the book id from the path.
 */
export default function BookDistributionPage() {
  const params = useParams<{ bookId: string }>();
  return <Distribution bookId={params.bookId} />;
}
