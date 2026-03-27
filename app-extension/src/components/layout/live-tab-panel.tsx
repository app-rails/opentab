import { useAppStore } from "@/stores/app-store";
import { LiveTabItem } from "@/components/live-tabs/live-tab-item";

export function LiveTabPanel() {
  const liveTabs = useAppStore((s) => s.liveTabs);

  return (
    <aside className="flex h-full flex-col border-l border-border p-4">
      <h2 className="mb-4 text-sm font-semibold">
        Live Tabs
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {liveTabs.length}
        </span>
      </h2>
      <div className="flex-1 space-y-0.5 overflow-auto">
        {liveTabs.map((tab) =>
          tab.id != null ? <LiveTabItem key={tab.id} tab={tab} /> : null,
        )}
      </div>
    </aside>
  );
}
