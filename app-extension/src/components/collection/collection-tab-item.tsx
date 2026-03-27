import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { TabFavicon } from "@/components/tab-favicon";
import { Button } from "@/components/ui/button";
import type { CollectionTab } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface CollectionTabItemProps {
  tab: CollectionTab;
  onRemove: () => void;
}

export function CollectionTabItem({ tab, onRemove }: CollectionTabItemProps) {
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
      className="group flex cursor-grab items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
    >
      <TabFavicon url={tab.favIconUrl} />
      <span className="flex-1 truncate" title={tab.url}>
        {tab.title || tab.url}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 opacity-0 group-hover:opacity-100"
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
