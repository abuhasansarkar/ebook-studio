"use client";

import { useParams } from "next/navigation";
import { ListingStudio } from "@/app/app/listing/page";

/**
 * The listing screen, reached from a book's tab.
 *
 * The screen itself lives at `/app/listing?bookId=…` so it can also be opened
 * directly. This route only supplies the book id from the path.
 */
export default function BookListingPage() {
  const params = useParams<{ bookId: string }>();
  return <ListingStudio bookId={params.bookId} />;
}
