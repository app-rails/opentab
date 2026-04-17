import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@opentab/ui/components/dialog";
import { cn } from "@opentab/ui/lib/utils";
import { useTranslation } from "react-i18next";
import type { TabCollection } from "@/lib/db";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";
import { useAppStore } from "@/stores/app-store";

interface MoveCollectionDialogProps {
  collection: TabCollection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoveCollectionDialog({
  collection,
  open,
  onOpenChange,
}: MoveCollectionDialogProps) {
  const { t } = useTranslation();
  const workspaces = useAppStore((s) => s.workspaces);
  const moveCollectionToWorkspace = useAppStore((s) => s.moveCollectionToWorkspace);

  const eligible = workspaces.filter(
    (w) => w.deletedAt == null && collection != null && w.id !== collection.workspaceId,
  );

  async function handleSelect(targetWorkspaceId: number) {
    if (collection?.id == null) return;
    await moveCollectionToWorkspace(collection.id, targetWorkspaceId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {t("dialog.move_collection.title", { name: collection?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("dialog.move_collection.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto py-2">
          {eligible.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground text-sm">
              {t("dialog.move_collection.empty")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {eligible.map((ws) => {
                const LucideIcon = WORKSPACE_ICONS[ws.icon] ?? WORKSPACE_ICONS.folder;
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      )}
                      onClick={() => ws.id != null && handleSelect(ws.id)}
                    >
                      <LucideIcon className="size-4 shrink-0" />
                      <span className="truncate">{ws.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
