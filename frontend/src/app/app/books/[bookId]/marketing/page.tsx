"use client";

import { useParams } from "next/navigation";
import { MarketingStudio } from "@/app/app/marketing/page";

/**
 * The marketing studio, reached from a book's tab.
 *
 * The studio itself lives at `/app/marketing?bookId=…` so it can also be
 * opened directly. This route only supplies the book id from the path.
 */
export default function BookMarketingPage() {
  const params = useParams<{ bookId: string }>();
  return <MarketingStudio bookId={params.bookId} />;
}
