import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { TabFavicon } from "@/components/tab-favicon";
import { Button } from "@/components/ui/button";
import type { CollectionTab } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface CollectionTabItemProps {
  tab: CollectionTab;
  isOpen: boolean;
  onRemove: () => void;
}

export function CollectionTabItem({ tab, isOpen, onRemove }: CollectionTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-tab-${tab.id}`,
    data: { type: DRAG_TYPES.COLLECTION_TAB, tab, collectionId: tab.collectionId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex h-[3rem] cursor-grab items-center gap-2 rounded-md border border-border bg-card p-2 text-sm hover:bg-accent"
    >
      {isOpen && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-green-500" />}
      <TabFavicon url={tab.favIconUrl} />
      <span className="flex-1 truncate text-xs" title={tab.url}>
        {tab.title || tab.url}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
