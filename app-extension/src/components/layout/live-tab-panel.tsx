import { ArrowDownUp, ChevronRight, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { LiveTabItem } from "@/components/live-tabs/live-tab-item";
import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";
import { Button } from "@/components/ui/button";
import { isValidTab } from "@/lib/tab-utils";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface LiveTabPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function LiveTabPanel({ collapsed, onToggleCollapse }: LiveTabPanelProps) {
  const liveTabs = useAppStore((s) => s.liveTabs);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortReversed, setSortReversed] = useState(false);

  const savableTabs = useMemo(() => liveTabs.filter(isValidTab), [liveTabs]);
  const displayTabs = sortReversed ? [...liveTabs].reverse() : liveTabs;

  return (
    <div className={cn("relative shrink-0", collapsed ? "w-3" : "")}>
      {/* Collapse toggle button — outside overflow-hidden so always visible */}
      <button
        type="button"
        className="absolute top-3 -left-3 z-10 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform duration-200", !collapsed && "rotate-180")}
        />
      </button>

      <aside
        className={cn(
          "flex h-full flex-col border-l border-border bg-background overflow-hidden transition-all duration-300 ease-in-out",
          collapsed ? "w-0 border-l-0" : "w-64",
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-medium text-muted-foreground ml-1">
            Tabs
            <span className="ml-1 text-xs">({liveTabs.length})</span>
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSortReversed((v) => !v)}
              title="Toggle sort order"
            >
              <ArrowDownUp className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={savableTabs.length === 0 || activeWorkspaceId == null}
              onClick={() => setDialogOpen(true)}
              className="gap-1"
            >
              <Save className="size-3" />
              Save
            </Button>
          </div>
        </div>

        {/* Tab list */}
        <div className="flex-1 space-y-0.5 overflow-auto p-2">
          {displayTabs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No session tabs</p>
          ) : (
            displayTabs.map((tab) =>
              tab.id != null ? <LiveTabItem key={tab.id} tab={tab} /> : null,
            )
          )}
        </div>

        {savableTabs.length > 0 && (
          <SaveTabsDialog open={dialogOpen} onOpenChange={setDialogOpen} tabs={savableTabs} />
        )}
      </aside>
    </div>
  );
}
