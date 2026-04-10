import { useDraggable } from "@dnd-kit/core";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { TabFavicon } from "@/components/tab-favicon";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface LiveTabItemProps {
  tab: chrome.tabs.Tab;
}

export const LiveTabItem = memo(function LiveTabItem({ tab }: LiveTabItemProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `live-tab-${tab.id}`,
    data: { type: DRAG_TYPES.LIVE_TAB, tab },
  });

  function handleClick() {
    if (tab.id != null) {
      chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId != null) {
        chrome.windows.update(tab.windowId, { focused: true });
      }
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit spreads listeners via attributes
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex h-14 cursor-grab items-center gap-2 rounded-md border border-transparent p-2 text-sm hover:bg-accent"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <TabFavicon url={tab.favIconUrl} size="md" />
      <span className="flex-1 min-w-0 text-xs leading-tight line-clamp-2">
        {tab.title || tab.url || t("live_tab.new_tab")}
      </span>
    </div>
  );
});
