import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/stores/app-store";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCollectionDialog({ open, onOpenChange }: CreateCollectionDialogProps) {
  const createCollection = useAppStore((s) => s.createCollection);
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= WORKSPACE_NAME_MAX_LENGTH;

  function handleCreate() {
    if (!isValid) return;
    createCollection(trimmed);
    setName("");
    onOpenChange(false);
  }

  function handleOpenChange(open: boolean) {
    if (!open) setName("");
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Collection</DialogTitle>
          <DialogDescription>Create a new tab collection in this workspace.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            id="col-name"
            autoFocus
            placeholder="Collection name"
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid) handleCreate();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!isValid}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
