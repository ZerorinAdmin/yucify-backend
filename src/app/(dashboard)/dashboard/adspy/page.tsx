import { AdSpySearchPanel } from "@/components/features/AdSpySearchPanel";
import { UsageBadge } from "@/components/features/UsageBadge";

export default function AdSpyPage() {
  return (
    <div className="flex min-h-[min(100dvh,720px)] flex-col sm:min-h-[calc(100vh-4rem)]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 py-2 sm:gap-4">
        <UsageBadge />
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <AdSpySearchPanel />
      </div>
    </div>
  );
}
