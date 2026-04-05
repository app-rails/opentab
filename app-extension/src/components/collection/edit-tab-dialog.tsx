import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="edit-tab-title" className="text-xs font-medium text-muted-foreground">
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
            <label htmlFor="edit-tab-url" className="text-xs font-medium text-muted-foreground">
              {t("edit_tab.label_url")}
            </label>
            <Input
              id="edit-tab-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError("");
              }}
              placeholder="https://example.com"
              className={urlError ? "border-destructive" : ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("edit_tab.cancel")}
          </Button>
          <Button onClick={handleSave}>{t("edit_tab.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
