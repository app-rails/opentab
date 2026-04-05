import {
  type Active,
  type Announcements,
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";
import { CollectionPanel } from "@/components/layout/collection-panel";
import { LiveTabPanel } from "@/components/layout/live-tab-panel";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { TabFavicon } from "@/components/tab-favicon";
import { useLiveTabSync } from "@/hooks/use-live-tab-sync";
import { DRAG_TYPES, type DragData } from "@/lib/dnd-types";
import { getSettings, saveSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { computeOrderBetween } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

function getDragType(active: Active): string | undefined {
  return (active.data.current as DragData | undefined)?.type;
}

function getDragTitle(active: Active): string {
  const data = active.data.current as DragData | undefined;
  if (!data) return "item";
  if (data.type === DRAG_TYPES.LIVE_TAB || data.type === DRAG_TYPES.COLLECTION_TAB) {
    return data.tab.title || "item";
  }
  return "item";
}

const customCollisionDetection: CollisionDetection = (args) => {
  const activeType = getDragType(args.active);
  if (activeType === DRAG_TYPES.LIVE_TAB) {
    return rectIntersection(args);
  }
  return closestCenter(args);
};

export default function App() {
  const { t } = useTranslation();

  const announcements: Announcements = useMemo(() => ({
    onDragStart({ active }) {
      const title = getDragTitle(active);
      return t("dnd.picked_up", { title });
    },
    onDragOver({ active, over }) {
      const title = getDragTitle(active);
      return over ? t("dnd.over_target", { title }) : t("dnd.not_over_target", { title });
    },
    onDragEnd({ active, over }) {
      const title = getDragTitle(active);
      return over ? t("dnd.dropped", { title }) : t("dnd.dropped_outside", { title });
    },
    onDragCancel({ active }) {
      const title = getDragTitle(active);
      return t("dnd.cancelled", { title });
    },
  }), [t]);
  const isLoading = useAppStore((s) => s.isLoading);

  useLiveTabSync();
  const { mode } = useTheme();

  // Layout state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Pre-zen state (to restore on zen exit)
  const [preZenSidebar, setPreZenSidebar] = useState(false);
  const [preZenPanel, setPreZenPanel] = useState(false);

  // Load persisted collapse states; collapse both on small viewports
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setSidebarCollapsed(true);
      setRightPanelCollapsed(true);
    } else {
      getSettings().then((s) => {
        setSidebarCollapsed(s.sidebar_collapsed);
        setRightPanelCollapsed(s.right_panel_collapsed);
      });
    }
  }, []);

  // Initialize store
  useEffect(() => {
    useAppStore
      .getState()
      .initialize()
      .catch((err) => {
        console.error("Failed to initialize app store:", err);
      });
  }, []);

  // ⌘J / Ctrl+J shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (!isZenMode) saveSettings({ sidebar_collapsed: next });
      return next;
    });
  }, [isZenMode]);

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed((prev) => {
      const next = !prev;
      if (!isZenMode) saveSettings({ right_panel_collapsed: next });
      return next;
    });
  }, [isZenMode]);

  const toggleZenMode = useCallback(() => {
    setIsZenMode((prev) => {
      if (!prev) {
        // Entering zen: save current states, collapse both
        setPreZenSidebar(sidebarCollapsed);
        setPreZenPanel(rightPanelCollapsed);
        setSidebarCollapsed(true);
        setRightPanelCollapsed(true);
      } else {
        // Exiting zen: restore previous states
        setSidebarCollapsed(preZenSidebar);
        setRightPanelCollapsed(preZenPanel);
      }
      return !prev;
    });
  }, [sidebarCollapsed, rightPanelCollapsed, preZenSidebar, preZenPanel]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeDrag, setActiveDrag] = useState<Active | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const type = getDragType(active);

    switch (type) {
      case DRAG_TYPES.WORKSPACE:
        handleWorkspaceReorder(active, over);
        break;
      case DRAG_TYPES.LIVE_TAB:
        handleLiveTabDrop(active, over);
        break;
      case DRAG_TYPES.COLLECTION_TAB:
        handleCollectionTabReorder(active, over);
        break;
    }
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  function handleWorkspaceReorder(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    if (active.id === over.id) return;
    const workspaces = useAppStore.getState().workspaces;
    const oldIndex = workspaces.findIndex((w) => w.id === active.id);
    const newIndex = workspaces.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = computeOrderBetween(workspaces, oldIndex, newIndex);
    useAppStore.getState().reorderWorkspace(active.id as number, newOrder);
  }

  function handleLiveTabDrop(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    const data = active.data.current as DragData;
    if (data.type !== DRAG_TYPES.LIVE_TAB) return;

    const overData = over.data.current as DragData | undefined;
    let collectionId: number | undefined;
    if (overData?.type === DRAG_TYPES.COLLECTION_DROP) {
      collectionId = overData.collectionId;
    } else if (overData?.type === DRAG_TYPES.COLLECTION_TAB) {
      collectionId = overData.collectionId;
    }
    if (collectionId == null) return;

    const tab = data.tab;
    if (!tab?.url) return;

    useAppStore.getState().addTabToCollection(collectionId, {
      url: tab.url,
      title: tab.title ?? tab.url ?? "Untitled",
      favIconUrl: tab.favIconUrl,
    });
  }

  function handleCollectionTabReorder(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    if (active.id === over.id) return;

    const data = active.data.current as DragData;
    if (data.type !== DRAG_TYPES.COLLECTION_TAB) return;

    const collectionId = data.tab.collectionId;
    const tabs = useAppStore.getState().tabsByCollection.get(collectionId) ?? [];

    const oldIndex = tabs.findIndex((t) => `col-tab-${t.id}` === String(active.id));
    const newIndex = tabs.findIndex((t) => `col-tab-${t.id}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = computeOrderBetween(tabs, oldIndex, newIndex);
    useAppStore.getState().reorderTabInCollection(data.tab.id!, collectionId, newOrder);
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
        <p className="text-muted-foreground">{t("settings.loading")}</p>
      </div>
    );
  }

  const activeDragData = activeDrag?.data.current as DragData | undefined;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{ announcements }}
      >
        <div className="flex h-screen bg-background">
          <WorkspaceSidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
          <div className="flex-1 min-w-0">
            <CollectionPanel
              isZenMode={isZenMode}
              onToggleZenMode={toggleZenMode}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
              sidebarCollapsed={sidebarCollapsed}
            />
          </div>
          <LiveTabPanel collapsed={rightPanelCollapsed} onToggleCollapse={toggleRightPanel} />
        </div>

        <DragOverlay>
          {activeDragData &&
            (activeDragData.type === DRAG_TYPES.LIVE_TAB ||
              activeDragData.type === DRAG_TYPES.COLLECTION_TAB) && (
              <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                <TabFavicon url={activeDragData.tab.favIconUrl} />
                <span className="max-w-[200px] truncate">
                  {activeDragData.tab.title ||
                    (activeDragData.type === DRAG_TYPES.LIVE_TAB
                      ? t("live_tab.new_tab")
                      : activeDragData.tab.url)}
                </span>
              </div>
            )}
        </DragOverlay>
      </DndContext>
      <Toaster position="bottom-center" theme={mode === "system" ? "system" : mode} />
    </>
  );
}
