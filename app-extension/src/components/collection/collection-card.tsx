import { useDroppable } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { ChevronRight, ExternalLink, Info, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CollectionTab, TabCollection } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { cn } from "@/lib/utils";
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
  const restoreCollection = useAppStore((s) => s.restoreCollection);
  const liveTabUrls = useAppStore((s) => s.liveTabUrls);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);
  const [collapsed, setCollapsed] = useState(false);

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
    if (tabs.length === 0 || collection.id == null) return;
    restoreCollection(collection.id);
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
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isOver ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          className="flex items-center gap-1 p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")}
          />
        </button>

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
            className="flex flex-1 items-center gap-1.5 text-sm font-medium"
            onDoubleClick={() => {
              setRenameValue(collection.name);
              setIsRenaming(true);
            }}
          >
            {collection.name}
            <span className="text-xs font-normal text-muted-foreground">
              {tabs.length}
            </span>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Collection info"
                    className="p-0"
                  >
                    <Info className="size-3 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Created: {new Date(collection.createdAt).toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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

      {/* Content — collapsible */}
      {!collapsed && (
        <>
          <SortableContext
            items={tabs.map((t) => `col-tab-${t.id}`)}
            strategy={rectSortingStrategy}
          >
            {tabs.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                {tabs.map((tab) => (
                  <CollectionTabItem
                    key={tab.id}
                    tab={tab}
                    isOpen={liveTabUrls.has(tab.url)}
                    onRemove={() => {
                      if (tab.id != null && collection.id != null) {
                        removeTabFromCollection(tab.id, collection.id);
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground/70">
                Drag tabs here or add a URL
              </p>
            )}
          </SortableContext>

          <div className="mt-1">
            <AddTabInline onAdd={handleAddUrl} />
          </div>
        </>
      )}
    </div>
  );
}
