import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  className,
  iconOnly = false,
}: {
  href?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 font-bold tracking-tight", className)}
      aria-label="eBookStudio home"
      title="eBookStudio home"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-2xs">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13" />
          <path d="M9 8h6M9 12h4" />
        </svg>
      </span>
      {!iconOnly && (
        <span className="text-lg whitespace-nowrap overflow-hidden transition-all duration-200">
          eBook<span className="text-primary">Studio</span>
        </span>
      )}
    </Link>
  );
}
