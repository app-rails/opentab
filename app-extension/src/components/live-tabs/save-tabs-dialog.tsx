import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TabFavicon } from "@/components/tab-favicon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
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
  const saveTabsAsCollection = useAppStore((s) => s.saveTabsAsCollection);
  const [name, setName] = useState(() => formatTimestamp());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(tabs.map((t) => t.id!)),
  );

  // Reset state when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(formatTimestamp());
      setSelectedIds(new Set(tabs.map((t) => t.id!)));
    }
    onOpenChange(nextOpen);
  };

  // Sync selectedIds when live tabs change (e.g. user closes a tab while dialog is open)
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(tabs.map((t) => t.id!));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabs]);

  const allSelected = selectedIds.size === tabs.length;
  const noneSelected = selectedIds.size === 0;
  const trimmedName = name.trim();
  const canSave =
    trimmedName.length > 0 && trimmedName.length <= WORKSPACE_NAME_MAX_LENGTH && !noneSelected;

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

  function handleSave() {
    if (!canSave) return;
    const selectedTabs = tabs
      .filter((t) => selectedIds.has(t.id!))
      .map((t) => ({
        url: t.url ?? "",
        title: t.title ?? t.url ?? "Untitled",
        favIconUrl: t.favIconUrl,
      }));
    saveTabsAsCollection(trimmedName, selectedTabs);
    toast.success(`Saved ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"} to "${trimmedName}"`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Save as Collection</DialogTitle>
          <DialogDescription>
            Save selected tabs as a new collection in the current workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            autoFocus
            placeholder="Collection name"
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
          />

          <div className="max-h-[280px] space-y-0.5 overflow-auto rounded-md border p-2">
            {tabs.map((tab) => (
              <label
                key={tab.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={selectedIds.has(tab.id!)}
                  onCheckedChange={() => toggleTab(tab.id!)}
                />
                <TabFavicon url={tab.favIconUrl} />
                <span className="truncate">{tab.title || tab.url || "New Tab"}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={toggleAll}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span>
              {selectedIds.size} of {tabs.length} selected
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
