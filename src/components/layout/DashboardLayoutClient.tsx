"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar, SidebarContent } from "@/components/layout/Sidebar";

type Account = {
  id: string;
  ad_account_id: string;
  account_name: string;
  is_active: boolean;
};

export function DashboardLayoutClient({
  accounts,
  children,
}: {
  accounts: Account[];
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[hsl(240,10%,97.5%)] lg:h-screen lg:flex-row">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-white px-3 sm:px-4 lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 rounded-xl border-border/70"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.8} />
        </Button>
        <Image
          src="/yucify-logo.png"
          alt="Yucify"
          width={120}
          height={36}
          className="h-8 w-auto object-contain"
          priority
        />
      </header>

      <Sidebar accounts={accounts} />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="flex w-[min(100vw,280px)] max-w-[min(100vw,280px)] flex-col gap-0 border-border/70 p-0 sm:max-w-sm"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent
            accounts={accounts}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
