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
import { DEFAULT_ICON, WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";
import { IconPicker } from "./icon-picker";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const { t } = useTranslation();
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_ICON);

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0 && trimmedName.length <= WORKSPACE_NAME_MAX_LENGTH;

  async function handleCreate() {
    if (!isValid) return;
    await createWorkspace(trimmedName, icon);
    setName("");
    setIcon(DEFAULT_ICON);
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setIcon(DEFAULT_ICON);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("dialog.create_workspace.title")}</DialogTitle>
          <DialogDescription>{t("dialog.create_workspace.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="ws-name" className="text-sm font-medium">
              {t("dialog.create_workspace.name_label")}
            </label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
              placeholder={t("dialog.create_workspace.name_placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid) handleCreate();
              }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("dialog.create_workspace.icon_label")}</span>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={!isValid}>
            {t("dialog.create_workspace.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
