import { useDndContext } from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@opentab/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@opentab/ui/components/dropdown-menu";
import { Input } from "@opentab/ui/components/input";
import { cn } from "@opentab/ui/lib/utils";
import {
  ChevronRight,
  EllipsisVertical,
  ExternalLink,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CollectionTab, TabCollection } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { faviconUrl } from "@/lib/url";
import type { ViewMode } from "@/lib/view-mode";
import { useAppStore } from "@/stores/app-store";
import { AddTabPopover } from "./add-tab-popover";
import { CollectionTabItem } from "./collection-tab-item";

interface CollectionCardProps {
  collection: TabCollection;
  tabs: CollectionTab[];
  viewMode: ViewMode;
  onRequestDelete: () => void;
}

export function CollectionCard({
  collection,
  tabs,
  viewMode,
  onRequestDelete,
}: CollectionCardProps) {
  const { t } = useTranslation();
  const renameCollection = useAppStore((s) => s.renameCollection);
  const removeTabFromCollection = useAppStore((s) => s.removeTabFromCollection);
  const addTabToCollection = useAppStore((s) => s.addTabToCollection);
  const restoreCollection = useAppStore((s) => s.restoreCollection);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);
  const [collapsed, setCollapsed] = useState(false);

  const sortableId = `collection-${collection.id}`;
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: sortableId,
    data: { type: DRAG_TYPES.COLLECTION, collectionId: collection.id },
  });

  // Detect when a live tab is being dragged over this collection
  const { active, over } = useDndContext();
  const isOver =
    over?.id === sortableId &&
    (active?.data.current as { type?: string } | undefined)?.type === DRAG_TYPES.LIVE_TAB;

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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

  function handleAddUrl(url: string, title: string) {
    if (collection.id == null) return;
    const favicon = faviconUrl(url);
    addTabToCollection(collection.id, {
      url,
      title: title || url,
      favIconUrl: favicon,
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      className={cn("transition-colors", isOver && "bg-primary/5")}
    >
      {/* Header */}
      <div className="group flex items-center gap-1 border-border border-b px-4 pt-2 pb-3">
        {/* Left group — drag handle */}
        <button
          type="button"
          className="cursor-grab touch-none border-0 bg-transparent p-0 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
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
            className="h-6 font-medium text-sm"
          />
        ) : (
          <button
            type="button"
            className="cursor-pointer rounded px-1 font-medium text-sm hover:bg-accent"
            onClick={() => {
              setRenameValue(collection.name);
              setIsRenaming(true);
            }}
          >
            {collection.name}
          </button>
        )}

        <button
          type="button"
          className="flex items-center p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t("collection_card.expand") : t("collection_card.collapse")}
          aria-expanded={!collapsed}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-200", !collapsed && "rotate-90")}
          />
        </button>

        {/* Spacer — click to collapse */}
        <button
          type="button"
          className="h-8 flex-1 cursor-pointer"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t("collection_card.expand") : t("collection_card.collapse")}
        />

        {/* Right group — visible on hover and keyboard focus within */}
        {!isRenaming && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <AddTabPopover onAdd={handleAddUrl} />
            {tabs.length > 0 && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleOpenAll}
                title={t("collection_card.open_all")}
              >
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onRequestDelete}
              title={t("collection_card.delete")}
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("collection_card.more_actions")}
                >
                  <EllipsisVertical className="size-3.5 text-muted-foreground" />
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
                  {t("collection_card.rename")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={onRequestDelete}>
                  <Trash2 className="mr-2 size-4" />
                  {t("collection_card.delete_menu")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Content — collapsible */}
      {!collapsed && (
        <div className="px-4 py-3">
          <SortableContext
            items={tabs.map((t) => `col-tab-${t.id}`)}
            strategy={viewMode === "list" ? verticalListSortingStrategy : rectSortingStrategy}
          >
            {tabs.length > 0 ? (
              <div
                className={cn(
                  "grid gap-2",
                  viewMode === "list"
                    ? "grid-cols-1"
                    : "grid-cols-[repeat(auto-fill,minmax(280px,1fr))]",
                )}
              >
                {tabs.map((tab) => (
                  <CollectionTabItem
                    key={tab.id}
                    tab={tab}
                    viewMode={viewMode}
                    onRemove={() => {
                      if (tab.id != null && collection.id != null) {
                        removeTabFromCollection(tab.id, collection.id);
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border border-dashed px-4 py-6 text-center text-muted-foreground/70 text-xs">
                {t("collection_card.drag_tabs_here")}
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </div>
  );
}
