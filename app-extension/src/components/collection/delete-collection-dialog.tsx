import { Trash2 } from "lucide-react";
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
          <AlertDialogTitle>Delete &ldquo;{collectionName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This collection and all its saved tabs will be permanently deleted. This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={handleDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
