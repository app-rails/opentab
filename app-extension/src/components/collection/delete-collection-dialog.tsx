import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppStore } from "@/stores/app-store";

interface DeleteCollectionDialogProps {
  collectionId: number | null;
  collectionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterDelete?: () => void;
}

export function DeleteCollectionDialog({
  collectionId,
  collectionName,
  open,
  onOpenChange,
  onAfterDelete,
}: DeleteCollectionDialogProps) {
  const { t } = useTranslation();
  const deleteCollection = useAppStore((s) => s.deleteCollection);

  function handleDelete() {
    if (collectionId == null) return;
    deleteCollection(collectionId);
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
            {t("dialog.delete_collection.title", { name: collectionName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("dialog.delete_collection.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("dialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDelete}
          >
            {t("dialog.delete_collection.submit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
