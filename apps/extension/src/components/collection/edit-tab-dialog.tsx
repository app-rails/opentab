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
import type { CollectionTab } from "@/lib/db";
import { faviconUrl, normalizeUrl } from "@/lib/url";
import { useAppStore } from "@/stores/app-store";

interface EditTabDialogProps {
  tab: CollectionTab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTabDialog({ tab, open, onOpenChange }: EditTabDialogProps) {
  const { t } = useTranslation();
  const updateTab = useAppStore((s) => s.updateTab);

  const [title, setTitle] = useState(tab.title);
  const [url, setUrl] = useState(tab.url);
  const [urlError, setUrlError] = useState("");

  function handleSave() {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setUrlError(t("edit_tab.invalid_url"));
      return;
    }

    if (tab.id == null) return;

    const newFavicon = normalized !== tab.url ? faviconUrl(normalized) : tab.favIconUrl;
    updateTab(tab.id, tab.collectionId, {
      title: title.trim() || normalized,
      url: normalized,
      favIconUrl: newFavicon,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("edit_tab.title")}</DialogTitle>
          <DialogDescription>{t("edit_tab.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="edit-tab-title" className="font-medium text-muted-foreground text-xs">
              {t("edit_tab.label_title")}
            </label>
            <Input
              id="edit-tab-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("edit_tab.title_placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-tab-url" className="font-medium text-muted-foreground text-xs">
              {t("edit_tab.label_url")}
            </label>
            <Input
              id="edit-tab-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError("");
              }}
              placeholder={t("add_tab.placeholder")}
              aria-invalid={!!urlError}
              aria-describedby={urlError ? "edit-tab-url-error" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            {urlError && (
              <p id="edit-tab-url-error" className="text-destructive text-xs">
                {urlError}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("edit_tab.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!normalizeUrl(url)}>
            {t("edit_tab.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
