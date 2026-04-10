import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@opentab/ui/components/alert-dialog";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/app-store";

interface DeleteWorkspaceDialogProps {
  workspaceId: number | null;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterDelete?: () => void;
}

export function DeleteWorkspaceDialog({
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
  onAfterDelete,
}: DeleteWorkspaceDialogProps) {
  const { t } = useTranslation();
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace);

  async function handleDelete() {
    if (workspaceId == null) return;
    await deleteWorkspace(workspaceId);
    onOpenChange(false);
    if (onAfterDelete) {
      setTimeout(() => onAfterDelete(), 0);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10">
            <Trash2 className="size-5 text-destructive" />
          </div>
          <AlertDialogTitle>
            {t("dialog.delete_workspace.title", { name: workspaceName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialog.delete_workspace.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("dialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("dialog.delete_workspace.submit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
