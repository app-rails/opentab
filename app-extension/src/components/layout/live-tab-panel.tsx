import { useMemo, useState } from "react";
import { LiveTabItem } from "@/components/live-tabs/live-tab-item";
import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";
import { Button } from "@/components/ui/button";
import { isValidTab } from "@/lib/tab-utils";
import { useAppStore } from "@/stores/app-store";

export function LiveTabPanel() {
  const liveTabs = useAppStore((s) => s.liveTabs);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const savableTabs = useMemo(() => liveTabs.filter(isValidTab), [liveTabs]);

  return (
    <aside className="flex h-full flex-col border-l border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Tabs
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({liveTabs.length})
          </span>
        </h2>
        <Button
          variant="default"
          size="xs"
          disabled={savableTabs.length === 0 || activeWorkspaceId == null}
          onClick={() => setDialogOpen(true)}
        >
          Save
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-auto">
        {liveTabs.map((tab) =>
          tab.id != null ? <LiveTabItem key={tab.id} tab={tab} /> : null,
        )}
      </div>
      {savableTabs.length > 0 && (
        <SaveTabsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tabs={savableTabs}
        />
      )}
    </aside>
  );
}
