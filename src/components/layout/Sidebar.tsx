"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  SAVED_BOARDS_KEY,
  SAVED_BOARDS_CHANGE_EVENT,
  SAVED_ANALYSES_CHANGE_EVENT,
} from "@/components/features/AdSpySearchPanel";
import { getSavedAnalysesCountFromLocalStorage } from "@/lib/adspy/saved-analyses-local";
import {
  LayoutDashboard,
  ShieldCheck,
  Bell,
  LogOut,
  ChevronRight,
  GitGraph,
  Search,
  Bookmark,
} from "lucide-react";
import { AccountSwitcher } from "@/components/features/AccountSwitcher";
import { FeedbackDialog } from "@/components/features/FeedbackDialog";

type Account = {
  id: string;
  ad_account_id: string;
  account_name: string;
  is_active: boolean;
};

const NAV_ITEMS = [
  { label: "Dashboard",     href: "/dashboard",            icon: LayoutDashboard },
  { label: "AD Diagnosis",  href: "/dashboard/health",     icon: ShieldCheck },
  { label: "Ad Library",    href: "/dashboard/adspy",      icon: Search },
  { label: "Funnel",        href: "/dashboard/funnel",     icon: GitGraph },
  { label: "Alerts",        href: "/dashboard/alerts",     icon: Bell },
];

const REPORTS = [
  { label: "My Boards",      href: "/dashboard/adspy?view=boards", icon: Bookmark, dot: "bg-sky-400" },
];

function hrefWithDateParams(href: string, searchParams: URLSearchParams | null): string {
  const from = searchParams?.get("from");
  const to = searchParams?.get("to");
  if (!from || !to) return href;
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}${params.toString()}`;
}

function getSavedBoardsCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(SAVED_BOARDS_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function getSavedAnalysesCount(): number {
  return getSavedAnalysesCountFromLocalStorage();
}

export function SidebarContent({
  accounts = [],
  onNavigate,
}: {
  accounts?: Account[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [savedBoardsCount, setSavedBoardsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function loadCounts() {
      const savedAdsCount = getSavedBoardsCount();
      const savedAnalysesCount = getSavedAnalysesCount();
      if (!cancelled) {
        setSavedBoardsCount(savedAdsCount + savedAnalysesCount);
      }
    }

    loadCounts();

    const handleSavedAdsChange = () => void loadCounts();
    const handleSavedAnalysesChange = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail;
      if (typeof detail === "number") {
        setSavedBoardsCount(getSavedBoardsCount() + detail);
        return;
      }
      void loadCounts();
    };

    window.addEventListener(SAVED_BOARDS_CHANGE_EVENT, handleSavedAdsChange);
    window.addEventListener(SAVED_ANALYSES_CHANGE_EVENT, handleSavedAnalysesChange);

    return () => {
      cancelled = true;
      window.removeEventListener(SAVED_BOARDS_CHANGE_EVENT, handleSavedAdsChange);
      window.removeEventListener(SAVED_ANALYSES_CHANGE_EVENT, handleSavedAnalysesChange);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      {/* Logo */}
      <div className="flex h-[60px] shrink-0 items-center px-6 pr-12">
        <Image
          src="/yucify-logo.png"
          alt="Yucify"
          width={120}
          height={36}
          className="h-9 w-auto object-contain"
        />
      </div>

      {/* Account switcher */}
      {accounts.length > 0 && (
        <div className="shrink-0 border-b border-border/70">
          <AccountSwitcher accounts={accounts} />
        </div>
      )}

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-4">
        <p className="px-3 mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Menu
        </p>
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isAdLibrary = item.href === "/dashboard/adspy";
            const view = searchParams?.get("view") ?? null;
            const active = isAdLibrary
              ? pathname === item.href && view !== "boards"
              : pathname === item.href;
            const Icon = item.icon;
            const href = hrefWithDateParams(item.href, searchParams);
            return (
              <Link
                key={item.href}
                href={href}
                onClick={() => onNavigate?.()}
                className={cn(
                  "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-[hsl(250,60%,96%)] text-[hsl(250,60%,55%)]"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[hsl(250,60%,55%)]" />
                  )}
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                  {item.label}
                </div>
                <ChevronRight className={cn("h-3.5 w-3.5 opacity-0 transition-opacity", active && "opacity-60")} />
              </Link>
            );
          })}
        </div>

        <div className="mt-8">
          <p className="px-3 mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Reports
          </p>
          <div className="space-y-0.5">
            {REPORTS.map((r) => {
              const Icon = r.icon;
              const isMyBoards = r.label === "My Boards";
              const reportActive = isMyBoards
                ? pathname === "/dashboard/adspy" && searchParams?.get("view") === "boards"
                : pathname === r.href;
              return (
                <Link
                  key={r.label}
                  href={hrefWithDateParams(r.href, searchParams)}
                  onClick={() => onNavigate?.()}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                    reportActive
                      ? "bg-[hsl(250,60%,96%)] text-[hsl(250,60%,55%)] font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {reportActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[hsl(250,60%,55%)]" />
                  )}
                  <Icon className="h-[18px] w-[18px]" strokeWidth={reportActive ? 2.2 : 1.8} />
                  {r.label}
                  {isMyBoards && savedBoardsCount > 0 && (
                    <span className="ml-auto min-w-[20px] rounded-full bg-primary/15 px-2 py-0.5 text-center text-[11px] font-semibold text-primary">
                      {savedBoardsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/70 px-3 py-3 space-y-0.5">
        <FeedbackDialog />
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({ accounts = [] }: { accounts?: Account[] }) {
  return (
    <aside className="hidden h-full w-[240px] shrink-0 flex-col border-r border-border/70 bg-white lg:flex lg:flex-col">
      <SidebarContent accounts={accounts} />
    </aside>
  );
}
