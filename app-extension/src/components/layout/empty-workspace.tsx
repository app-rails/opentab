import { FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";
import { Button } from "@/components/ui/button";
import { isValidTab } from "@/lib/tab-utils";
import { useAppStore } from "@/stores/app-store";

export function EmptyWorkspace() {
  const liveTabs = useAppStore((s) => s.liveTabs);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const savableTabs = useMemo(() => liveTabs.filter(isValidTab), [liveTabs]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <FolderOpen className="size-10 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Get started</p>
        <p className="max-w-[240px] text-xs text-muted-foreground/70">
          Drag tabs from the right panel or save your open tabs as a collection.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={savableTabs.length === 0 || activeWorkspaceId == null}
        onClick={() => setDialogOpen(true)}
      >
        Save Current Tabs
      </Button>
      {savableTabs.length > 0 && (
        <SaveTabsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tabs={savableTabs}
        />
      )}
    </div>
  );
}
