"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Distribution } from "@/components/studio/distribution-screen";

/**
 * The distribution route.
 *
 * The screen itself lives in `components/studio/distribution-screen` so the
 * per-book route can render the same thing. This route only supplies the book
 * id, from the path or from the query.
 */
export default function DistributionPage() {
  const params = useParams<{ bookId?: string }>();
  const search = useSearchParams();
  return <Distribution bookId={params.bookId ?? search.get("bookId") ?? ""} />;
}
