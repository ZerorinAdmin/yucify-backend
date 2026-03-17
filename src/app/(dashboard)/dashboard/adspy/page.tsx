import { AdSpySearchPanel } from "@/components/features/AdSpySearchPanel";
import { UsageBadge } from "@/components/features/UsageBadge";

export default function AdSpyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-border/60 shrink-0">
        <UsageBadge />
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <AdSpySearchPanel />
      </div>
    </div>
  );
}
