import { Button } from "@opentab/ui/components/button";
import { cn } from "@opentab/ui/lib/utils";
import { ArrowDownUp, ChevronRight, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LiveTabItem } from "@/components/live-tabs/live-tab-item";
import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";
import { isValidTab } from "@/lib/tab-utils";
import { useAppStore } from "@/stores/app-store";

interface LiveTabPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function LiveTabPanel({ collapsed, onToggleCollapse }: LiveTabPanelProps) {
  const { t } = useTranslation();
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
        aria-label={collapsed ? t("live_tab.expand_panel") : t("live_tab.collapse_panel")}
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
            {t("live_tab.tabs")}
            <span className="ml-1 text-xs">({liveTabs.length})</span>
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setSortReversed((v) => !v)}
              title={t("live_tab.toggle_sort")}
            >
              <ArrowDownUp className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={savableTabs.length === 0 || activeWorkspaceId == null}
              onClick={(e) => {
                e.currentTarget.blur();
                setDialogOpen(true);
              }}
              className="gap-1"
            >
              <Save className="size-3" />
              {t("live_tab.save")}
            </Button>
          </div>
        </div>

        {/* Tab list */}
        <div className="flex-1 space-y-0.5 overflow-auto p-2">
          {displayTabs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("live_tab.no_tabs")}
            </p>
          ) : (
            displayTabs.map((tab) =>
              tab.id != null ? <LiveTabItem key={tab.id} tab={tab} /> : null,
            )
          )}
        </div>
      </aside>

      {savableTabs.length > 0 && (
        <SaveTabsDialog open={dialogOpen} onOpenChange={setDialogOpen} tabs={savableTabs} />
      )}
    </div>
  );
}
