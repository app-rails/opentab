import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, EllipsisVertical, ExternalLink, Trash2 } from "lucide-react";
import { TabFavicon } from "@/components/tab-favicon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CollectionTab } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import type { ViewMode } from "@/lib/view-mode";
import { cn } from "@/lib/utils";

interface CollectionTabItemProps {
  tab: CollectionTab;
  viewMode: ViewMode;
  onRemove: () => void;
}

const containerStyles: Record<ViewMode, string> = {
  default:
    "flex h-14 items-center gap-2 rounded-md border border-border bg-card p-2 text-sm hover:bg-accent",
  compact:
    "flex h-[38px] items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm hover:bg-accent",
  list:
    "flex h-[38px] items-center rounded-lg border border-border bg-card px-5 text-sm hover:bg-accent",
};

export function CollectionTabItem({ tab, viewMode, onRemove }: CollectionTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-tab-${tab.id}`,
    data: { type: DRAG_TYPES.COLLECTION_TAB, tab, collectionId: tab.collectionId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleOpen() {
    chrome.tabs.create({ url: tab.url, active: true });
  }

  function handleCopyUrl() {
    void navigator.clipboard.writeText(tab.url).catch(() => {});
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("group", containerStyles[viewMode])}
    >
      {viewMode !== "list" && (
        <TabFavicon url={tab.favIconUrl} size={viewMode === "default" ? "md" : "compact"} />
      )}

      <span
        className={cn(
          "flex-1 min-w-0 text-xs leading-tight",
          viewMode === "default" ? "ml-0.5 line-clamp-2" : "truncate",
        )}
        title={tab.url}
      >
        {tab.title || tab.url}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <EllipsisVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
          >
            <ExternalLink className="mr-2 size-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopyUrl();
            }}
          >
            <Copy className="mr-2 size-4" />
            Copy URL
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="mr-2 size-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
