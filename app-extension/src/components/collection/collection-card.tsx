import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CollectionTab, TabCollection } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { useAppStore } from "@/stores/app-store";
import { AddTabInline } from "./add-tab-inline";
import { CollectionTabItem } from "./collection-tab-item";

interface CollectionCardProps {
  collection: TabCollection;
  tabs: CollectionTab[];
  canDelete: boolean;
  onRequestDelete: () => void;
}

export function CollectionCard({
  collection,
  tabs,
  canDelete,
  onRequestDelete,
}: CollectionCardProps) {
  const renameCollection = useAppStore((s) => s.renameCollection);
  const removeTabFromCollection = useAppStore((s) => s.removeTabFromCollection);
  const addTabToCollection = useAppStore((s) => s.addTabToCollection);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);

  const { setNodeRef, isOver } = useDroppable({
    id: `collection-drop-${collection.id}`,
    data: { type: DRAG_TYPES.COLLECTION_DROP, collectionId: collection.id },
  });

  function handleRenameConfirm() {
    if (collection.id != null && renameValue.trim()) {
      renameCollection(collection.id, renameValue);
    }
    setIsRenaming(false);
  }

  function handleOpenAll() {
    if (tabs.length === 0) return;
    chrome.windows.create({ url: tabs.map((t) => t.url) });
  }

  function handleAddUrl(url: string) {
    if (collection.id == null) return;
    const domain = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();
    addTabToCollection(collection.id, {
      url,
      title: url,
      favIconUrl: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined,
    });
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameConfirm();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={handleRenameConfirm}
            className="h-6 text-sm font-medium"
          />
        ) : (
          <h3
            className="flex-1 text-sm font-medium"
            onDoubleClick={() => {
              setRenameValue(collection.name);
              setIsRenaming(true);
            }}
          >
            {collection.name}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{tabs.length}</span>
          </h3>
        )}

        {!isRenaming && (
          <div className="flex items-center gap-0.5">
            {tabs.length > 0 && (
              <Button variant="ghost" size="icon-xs" onClick={handleOpenAll} title="Open all tabs">
                <ExternalLink className="size-3.5" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(collection.name);
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canDelete}
                  className={canDelete ? "text-destructive" : "text-muted-foreground"}
                  onClick={onRequestDelete}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Tab list */}
      <SortableContext
        items={tabs.map((t) => `col-tab-${t.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0.5">
          {tabs.map((tab) => (
            <CollectionTabItem
              key={tab.id}
              tab={tab}
              onRemove={() => {
                if (tab.id != null && collection.id != null) {
                  removeTabFromCollection(tab.id, collection.id);
                }
              }}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add URL inline */}
      <div className="mt-1">
        <AddTabInline onAdd={handleAddUrl} />
      </div>
    </div>
  );
}
