"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Coins,
  CreditCard,
  FolderKanban,
  Images,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
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
  { href: "/app/editor", label: "eBook Editor", icon: PenLine },
  { href: "/app/coloring-book", label: "Coloring Studio", icon: Palette },
  { href: "/app/books", label: "My eBooks", icon: BookOpen },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/image-studio", label: "Cover & illustrations", icon: Images },
  { href: "/app/credits", label: "Credits", icon: Coins },
  { href: "/app/credits/billing", label: "Plans & billing", icon: CreditCard },
  { href: "/app/support", label: "Support", icon: LifeBuoy },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function NavLinks({
  isCollapsed = false,
  onNavigate,
}: {
  isCollapsed?: boolean;
  onNavigate?: () => void;
}) {
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
    <nav className="space-y-1" aria-label="App" suppressHydrationWarning>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/app/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={isCollapsed ? label : undefined}
            className={cn(
              "group relative flex items-center rounded-xl text-sm font-medium transition-all duration-150",
              isCollapsed
                ? "justify-center p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                : "gap-3 px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-primary-soft text-primary-hover font-semibold",
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {!isCollapsed && <span className="truncate">{label}</span>}

            {/* Hover Tooltip when sidebar is collapsed */}
            {isCollapsed && (
              <span className="pointer-events-none absolute left-full ml-2.5 z-50 hidden rounded-md bg-neutral-900 dark:bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white shadow-lg group-hover:block whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
                {label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const router = useRouter();
  const { data: session } = useSession();
  const credits = useCredits();
  const mounted = useMounted();
  const initial = mounted && session?.user.name ? session.user.name[0]?.toUpperCase() : "?";

  if (isCollapsed) {
    return (
      <div className="space-y-2.5 pt-2 border-t border-border/50" suppressHydrationWarning>
        {/* Compact credits badge */}
        <Link
          href="/app/credits"
          title={`Credits: ${credits.data ? formatNumber(credits.data.wallet.balance) : "—"}`}
          className="group relative flex flex-col items-center justify-center rounded-xl border border-border bg-background p-2 text-center hover:bg-muted transition-colors shadow-2xs"
          suppressHydrationWarning
        >
          <Coins className="h-4 w-4 text-primary shrink-0" />
          <span className="mt-1 text-[10px] font-bold font-mono">
            {credits.data ? formatNumber(credits.data.wallet.balance) : "—"}
          </span>
          <span className="pointer-events-none absolute left-full ml-2.5 z-50 hidden rounded-md bg-neutral-900 dark:bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white shadow-lg group-hover:block whitespace-nowrap">
            Credits: {credits.data ? formatNumber(credits.data.wallet.balance) : "—"}
          </span>
        </Link>

        {/* User avatar initial & logout */}
        <div className="flex flex-col items-center gap-1.5" suppressHydrationWarning>
          <div
            title={mounted ? `${session?.user.name || ""} (${session?.user.email || ""})` : "Account"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-2xs"
            suppressHydrationWarning
          >
            {initial}
          </div>
          <button
            type="button"
            aria-label="Log out"
            title="Log out"
            data-editor-navigation
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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

  return (
    <div className="space-y-3 pt-2 border-t border-border/50" suppressHydrationWarning>
      <Link href="/app/credits" className="block rounded-xl border border-border bg-background p-3 hover:bg-muted transition-colors" suppressHydrationWarning>
        <p className="text-xs text-muted-foreground">Credits</p>
        <p className="mt-0.5 text-lg font-bold">{credits.data ? formatNumber(credits.data.wallet.balance) : "—"}</p>
        {credits.data && credits.data.wallet.reserved > 0 && <p className="text-xs text-muted-foreground">{credits.data.wallet.reserved} reserved for running jobs</p>}
      </Link>
      <div className="flex items-center gap-3 px-1" suppressHydrationWarning>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white shadow-2xs" suppressHydrationWarning>
          {initial}
        </div>
        <div className="min-w-0 flex-1" suppressHydrationWarning>
          <p className="truncate text-sm font-semibold">{mounted ? session?.user.name : ""}</p>
          <p className="truncate text-xs text-muted-foreground">{mounted ? session?.user.email : ""}</p>
        </div>
        <button
          type="button"
          aria-label="Log out"
          title="Log out"
          // Lets the editor's unsaved-changes guard stop a logout like any other way out.
          data-editor-navigation
          className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("ebookstudio_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("ebookstudio_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Client-side guard (the proxy only checks cookie presence; the API enforces auth).
  useEffect(() => {
    // window is read inside the effect, so this stays client-only.
    if (!isPending && !session) router.replace(`/login?next=${encodeURIComponent(`${pathname}${window.location.search}`)}`);
  }, [isPending, session, router, pathname]);

  // The proxy already blocks requests without a session cookie, so render the page
  // immediately and only swap in a loader once the client knows the session is invalid.
  if (!isPending && !session) return <PageLoader label="Redirecting to log in…" />;

  return (
    <div className="flex min-h-screen" suppressHydrationWarning>
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col justify-between border-e border-border bg-surface transition-all duration-300 ease-in-out lg:flex",
          isCollapsed ? "w-20 p-2.5" : "w-64 p-4",
        )}
        suppressHydrationWarning
      >
        <div className="flex flex-col min-h-0 flex-1" suppressHydrationWarning>
          {/* Header with Logo and Collapse / Open toggle button */}
          <div
            className={cn(
              "mb-6 flex items-center pt-1 transition-all",
              isCollapsed ? "flex-col gap-3 items-center px-0.5" : "justify-between px-2",
            )}
            suppressHydrationWarning
          >
            <Logo href="/app/dashboard" iconOnly={isCollapsed} />
            <button
              type="button"
              aria-label={isCollapsed ? "Open sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Open sidebar (expand)" : "Collapse sidebar"}
              className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={toggleCollapse}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4.5 w-4.5 text-primary" />
              ) : (
                <PanelLeftClose className="h-4.5 w-4.5" />
              )}
            </button>
          </div>

          {/* Scrollable Navigation Links */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
            <NavLinks isCollapsed={isCollapsed} />
          </div>
        </div>

        {/* Footer */}
        <SidebarFooter isCollapsed={isCollapsed} />
      </aside>

      {/* Mobile Bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden" suppressHydrationWarning>
        <Logo href="/app/dashboard" />
        <button type="button" aria-label="Open menu" className="cursor-pointer rounded-lg p-2 hover:bg-muted" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" suppressHydrationWarning>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 start-0 flex w-72 flex-col justify-between bg-surface p-4" suppressHydrationWarning>
            <div suppressHydrationWarning>
              <div className="mb-8 flex items-center justify-between" suppressHydrationWarning>
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

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 pt-14 lg:pt-0" suppressHydrationWarning>{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" suppressHydrationWarning>
      <div suppressHydrationWarning>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2" suppressHydrationWarning>{actions}</div>}
    </div>
  );
}
