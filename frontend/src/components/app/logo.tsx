import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-bold tracking-tight", className)} aria-label="eBookStudio home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13" />
          <path d="M9 8h6M9 12h4" />
        </svg>
      </span>
      <span className="text-lg">
        eBook<span className="text-primary">Studio</span>
      </span>
    </Link>
  );
}
