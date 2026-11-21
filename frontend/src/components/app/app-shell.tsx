"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Coins,
  FolderKanban,
  Images,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  PlusCircle,
  Settings,
  Shield,
  X,
} from "lucide-react";
import { Logo } from "@/components/app/logo";
import { PageLoader } from "@/components/ui/misc";
import { signOut, useSession } from "@/lib/auth-client";
import { useCredits } from "@/lib/queries";
import { useAdminAuthority } from "@/lib/studio-queries";
import { useMounted } from "@/lib/use-mounted";
import { cn, formatNumber } from "@/lib/utils";

const NAV = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/create", label: "Create eBook", icon: PlusCircle },
  { href: "/app/books", label: "My eBooks", icon: BookOpen },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/image-studio", label: "Image library", icon: Images },
  { href: "/app/credits", label: "Credits", icon: Coins },
  { href: "/app/support", label: "Support", icon: LifeBuoy },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // The operations console only appears for accounts that hold an operator
  // role. The API checks the permission on every route regardless, so this is
  // a convenience rather than the control.
  const authority = useAdminAuthority();
  // The link is added once the browser has mounted, so the server markup and
  // the first client render agree and the page hydrates without a mismatch.
  const mounted = useMounted();
  const isOperator = mounted && (authority.data?.roles.length ?? 0) > 0;

  const items = isOperator
    ? [...NAV, { href: "/app/admin", label: "Operations", icon: Shield }]
    : NAV;

  return (
    <nav className="space-y-1" aria-label="App">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/app/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary-hover" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4.5 w-4.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const router = useRouter();
  const { data: session } = useSession();
  const credits = useCredits();
  return (
    <div className="space-y-3">
      <Link href="/app/credits" className="block rounded-xl border border-border bg-background p-3 hover:bg-muted">
        <p className="text-xs text-muted-foreground">Credits</p>
        <p className="mt-0.5 text-lg font-bold">{credits.data ? formatNumber(credits.data.wallet.balance) : "—"}</p>
        {credits.data && credits.data.wallet.reserved > 0 && <p className="text-xs text-muted-foreground">{credits.data.wallet.reserved} reserved for running jobs</p>}
      </Link>
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {session?.user.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session?.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session?.user.email}</p>
        </div>
        <button
          type="button"
          aria-label="Log out"
          title="Log out"
          // Lets the editor's unsaved-changes guard stop a logout like any other way out.
          data-editor-navigation
          className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Client-side guard (the proxy only checks cookie presence; the API enforces auth).
  useEffect(() => {
    // window is read inside the effect, so this stays client-only.
    if (!isPending && !session) router.replace(`/login?next=${encodeURIComponent(`${pathname}${window.location.search}`)}`);
  }, [isPending, session, router, pathname]);

  // The proxy already blocks requests without a session cookie, so render the page
  // immediately and only swap in a loader once the client knows the session is invalid.
  if (!isPending && !session) return <PageLoader label="Redirecting to log in…" />;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-e border-border bg-surface p-4 lg:flex">
        <div>
          <Logo href="/app/dashboard" className="mb-8 px-2 pt-1" />
          <NavLinks />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <Logo href="/app/dashboard" />
        <button type="button" aria-label="Open menu" className="cursor-pointer rounded-lg p-2 hover:bg-muted" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 start-0 flex w-72 flex-col justify-between bg-surface p-4">
            <div>
              <div className="mb-8 flex items-center justify-between">
                <Logo href="/app/dashboard" />
                <button type="button" aria-label="Close menu" className="cursor-pointer rounded-lg p-2 hover:bg-muted" onClick={() => setMobileOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </div>
            <SidebarFooter />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
