"use client";

import { useParams, useSearchParams } from "next/navigation";
import { MarketingStudio } from "@/components/studio/marketing-screen";

/**
 * The marketing route.
 *
 * The screen itself lives in `components/studio/marketing-screen` so the
 * per-book route can render the same thing. This route only supplies the book
 * id, from the path or from the query.
 */
export default function MarketingStudioPage() {
  const params = useParams<{ bookId?: string }>();
  const search = useSearchParams();
  return <MarketingStudio bookId={params.bookId ?? search.get("bookId") ?? ""} />;
}
