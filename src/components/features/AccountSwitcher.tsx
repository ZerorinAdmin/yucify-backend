"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

type Account = {
  id: string;
  ad_account_id: string;
  account_name: string;
  is_active: boolean;
};

export function AccountSwitcher({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const activeAccount = accounts.find((a) => a.is_active) ?? accounts[0];

  if (!accounts.length) return null;

  const handleSwitch = async (adAccountId: string) => {
    if (adAccountId === activeAccount?.ad_account_id) return;
    const res = await fetch("/api/meta/switch-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad_account_id: adAccountId }),
    });
    if (res.ok) {
      router.refresh();
    }
  };

  return (
    <div className="px-3 pb-3">
      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Ad account
      </p>
      <Select
        value={activeAccount?.ad_account_id ?? ""}
        onValueChange={handleSwitch}
      >
        <SelectTrigger className="h-9 w-full rounded-lg border-border/70 bg-muted/30 text-[13px] font-medium">
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((acc) => (
            <SelectItem
              key={acc.id}
              value={acc.ad_account_id}
              className="text-[13px]"
            >
              <span className="truncate max-w-[180px] block">
                {acc.account_name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <a
        href="/api/meta/connect"
        className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add another account
      </a>
    </div>
  );
}
