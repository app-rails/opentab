import { Button } from "@opentab/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@opentab/ui/components/dialog";
import { Input } from "@opentab/ui/components/input";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCollectionDialog({ open, onOpenChange }: CreateCollectionDialogProps) {
  const { t } = useTranslation();
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
          <DialogTitle>{t("dialog.create_collection.title")}</DialogTitle>
          <DialogDescription>{t("dialog.create_collection.description")}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            id="col-name"
            autoFocus
            placeholder={t("dialog.create_collection.name_placeholder")}
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
            {t("dialog.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={!isValid}>
            {t("dialog.create_collection.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
