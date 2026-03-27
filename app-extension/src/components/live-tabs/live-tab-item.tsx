import { useDraggable } from "@dnd-kit/core";
import { memo } from "react";
import { TabFavicon } from "@/components/tab-favicon";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface LiveTabItemProps {
  tab: chrome.tabs.Tab;
}

export const LiveTabItem = memo(function LiveTabItem({ tab }: LiveTabItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `live-tab-${tab.id}`,
    data: { type: DRAG_TYPES.LIVE_TAB, tab },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <TabFavicon url={tab.favIconUrl} />
      <span className="truncate">{tab.title || tab.url || "New Tab"}</span>
    </div>
  );
});
