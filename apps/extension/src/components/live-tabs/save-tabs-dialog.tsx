import { Button } from "@opentab/ui/components/button";
import { Checkbox } from "@opentab/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@opentab/ui/components/dialog";
import { Input } from "@opentab/ui/components/input";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TabFavicon } from "@/components/tab-favicon";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
import { getSettings, updateSettings } from "@/lib/settings";
import { useAppStore } from "@/stores/app-store";

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

interface SaveTabsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: chrome.tabs.Tab[];
}

export function SaveTabsDialog({ open, onOpenChange, tabs }: SaveTabsDialogProps) {
  const { t } = useTranslation();
  const saveTabsAsCollection = useAppStore((s) => s.saveTabsAsCollection);
  const [name, setName] = useState(() => formatTimestamp());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(tabs.map((t) => t.id!)),
  );
  const [closeAfter, setCloseAfter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSettingsLoaded(false);
    setCloseAfter(false);
    getSettings()
      .then((s) => {
        if (!cancelled) setCloseAfter(s.save_tabs_close_after);
      })
      .catch((err) => {
        console.error("[save-tabs] failed to load settings:", err);
        if (!cancelled) setCloseAfter(false);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset state when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  // Reset selections when dialog opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only reset on open change, tabs sync handled separately
  useEffect(() => {
    if (open) {
      setName(formatTimestamp());
      setSelectedIds(new Set(tabs.map((t) => t.id!)));
    }
  }, [open]);

  // Sync selectedIds when live tabs change while dialog is open (e.g. user closes a tab)
  useEffect(() => {
    if (!open) return;
    setSelectedIds((prev) => {
      const validIds = new Set(tabs.map((t) => t.id!));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabs, open]);

  const allSelected = selectedIds.size === tabs.length;
  const noneSelected = selectedIds.size === 0;
  const trimmedName = name.trim();
  const canSave =
    trimmedName.length > 0 && trimmedName.length <= WORKSPACE_NAME_MAX_LENGTH && !noneSelected;
  const saveDisabled = !canSave || !settingsLoaded || saving;

  function toggleTab(tabId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tabs.map((t) => t.id!)));
    }
  }

  function handleCloseAfterChange(next: boolean) {
    setCloseAfter(next);
    updateSettings({ save_tabs_close_after: next }).catch((err) => {
      console.error("[save-tabs] failed to persist close_after:", err);
    });
  }

  async function handleSave() {
    if (!canSave) return;
    const selectedTabs = tabs.filter((t) => selectedIds.has(t.id!));
    const payload = selectedTabs.map((t) => ({
      url: t.url ?? "",
      title: t.title ?? t.url ?? "Untitled",
      favIconUrl: t.favIconUrl,
    }));

    setSaving(true);
    try {
      const saved = await saveTabsAsCollection(trimmedName, payload);
      if (!saved) {
        toast.error(t("dialog.save_tabs.toast_error"));
        return;
      }

      toast.success(
        t("dialog.save_tabs.toast_success", { count: payload.length, name: trimmedName }),
      );

      if (closeAfter) {
        const selfPrefix = chrome.runtime.getURL("");
        const closableIds = selectedTabs
          .filter((t) => t.id != null && !(t.url ?? "").startsWith(selfPrefix))
          .map((t) => t.id!);
        if (closableIds.length > 0) {
          chrome.tabs.remove(closableIds).catch((err) => {
            console.error("[save-tabs] close failed:", err);
          });
        }
      }

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("dialog.save_tabs.title")}</DialogTitle>
          <DialogDescription>{t("dialog.save_tabs.description")}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
          <Input
            autoFocus
            placeholder={t("dialog.save_tabs.name_placeholder")}
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saveDisabled) handleSave();
            }}
          />

          <div className="max-h-[280px] space-y-0.5 overflow-auto rounded-md border p-2">
            {tabs.map((tab) => (
              // biome-ignore lint/a11y/noLabelWithoutControl: label wraps Radix Checkbox which renders input internally
              <label
                key={tab.id}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={selectedIds.has(tab.id!)}
                  onCheckedChange={() => toggleTab(tab.id!)}
                />
                <TabFavicon url={tab.favIconUrl} />
                <span className="truncate">
                  {tab.title || tab.url || t("dialog.save_tabs.new_tab")}
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={toggleAll}
            >
              {allSelected ? t("dialog.save_tabs.deselect_all") : t("dialog.save_tabs.select_all")}
            </button>
            <span>
              {t("dialog.save_tabs.selected_count", {
                selected: selectedIds.size,
                total: tabs.length,
              })}
            </span>
          </div>

          {/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Radix Checkbox which renders input internally */}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={closeAfter}
              disabled={!settingsLoaded}
              onCheckedChange={(v) => handleCloseAfterChange(v === true)}
            />
            <span>{t("dialog.save_tabs.close_after")}</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            {t("dialog.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saveDisabled}>
            {t("dialog.save_tabs.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
