"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ListingStudio } from "@/components/studio/listing-screen";

/**
 * The listing route.
 *
 * The screen itself lives in `components/studio/listing-screen` so the per-book
 * route can render the same thing. This route only supplies the book id, from
 * the path or from the query.
 */
export default function BookListingPage() {
  const params = useParams<{ bookId: string }>();
  const search = useSearchParams();
  const bookId = search.get("bookId") ?? params?.bookId ?? "";
  return <ListingStudio bookId={bookId} />;
}
