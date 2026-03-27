import {
  type Active,
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
import { generateKeyBetween } from "fractional-indexing";
import { useEffect, useState } from "react";
import { CollectionPanel } from "@/components/layout/collection-panel";
import { LiveTabPanel } from "@/components/layout/live-tab-panel";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { useLiveTabSync } from "@/hooks/use-live-tab-sync";
import { DRAG_TYPES, type DragData } from "@/lib/dnd-types";
import { useAppStore } from "@/stores/app-store";

function getDragType(active: Active): string | undefined {
  return (active.data.current as DragData | undefined)?.type;
}

const customCollisionDetection: CollisionDetection = (args) => {
  const activeType = getDragType(args.active);
  if (activeType === DRAG_TYPES.LIVE_TAB) {
    return rectIntersection(args);
  }
  return closestCenter(args);
};

export default function App() {
  const isLoading = useAppStore((s) => s.isLoading);

  useLiveTabSync();

  useEffect(() => {
    useAppStore
      .getState()
      .initialize()
      .catch((err) => {
        console.error("Failed to initialize app store:", err);
      });
  }, []);

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

    let lowerBound: string | null = null;
    let upperBound: string | null = null;

    if (newIndex < oldIndex) {
      lowerBound = newIndex > 0 ? workspaces[newIndex - 1].order : null;
      upperBound = workspaces[newIndex].order;
    } else {
      lowerBound = workspaces[newIndex].order;
      upperBound = newIndex < workspaces.length - 1 ? workspaces[newIndex + 1].order : null;
    }

    const newOrder = generateKeyBetween(lowerBound, upperBound);
    useAppStore.getState().reorderWorkspace(active.id as number, newOrder);
  }

  function handleLiveTabDrop(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    const data = active.data.current as DragData;
    if (data.type !== DRAG_TYPES.LIVE_TAB) return;

    const overData = over.data.current as Record<string, unknown> | undefined;
    // Resolve collectionId from either a collection drop-zone or an existing collection-tab row
    const collectionId =
      (overData?.collectionId as number | undefined) ??
      ((overData?.tab as Record<string, unknown> | undefined)?.collectionId as number | undefined);
    if (collectionId == null) return;

    const tab = data.tab;
    useAppStore.getState().addTabToCollection(collectionId, {
      url: tab.url ?? "",
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

    let lowerBound: string | null = null;
    let upperBound: string | null = null;

    if (newIndex < oldIndex) {
      lowerBound = newIndex > 0 ? tabs[newIndex - 1].order : null;
      upperBound = tabs[newIndex].order;
    } else {
      lowerBound = tabs[newIndex].order;
      upperBound = newIndex < tabs.length - 1 ? tabs[newIndex + 1].order : null;
    }

    const newOrder = generateKeyBetween(lowerBound, upperBound);
    useAppStore.getState().reorderTabInCollection(data.tab.id!, collectionId, newOrder);
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const activeDragType = activeDrag ? getDragType(activeDrag) : undefined;
  const activeDragData = activeDrag?.data.current as DragData | undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid h-screen grid-cols-[240px_1fr_320px] bg-background">
        <WorkspaceSidebar />
        <CollectionPanel />
        <LiveTabPanel />
      </div>

      <DragOverlay>
        {activeDragType === DRAG_TYPES.LIVE_TAB && activeDragData?.type === DRAG_TYPES.LIVE_TAB && (
          <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
            {activeDragData.tab.favIconUrl ? (
              <img src={activeDragData.tab.favIconUrl} alt="" className="size-4 rounded-sm" />
            ) : (
              <div className="size-4 rounded-sm bg-muted" />
            )}
            <span className="max-w-[200px] truncate">{activeDragData.tab.title || "New Tab"}</span>
          </div>
        )}
        {activeDragType === DRAG_TYPES.COLLECTION_TAB &&
          activeDragData?.type === DRAG_TYPES.COLLECTION_TAB && (
            <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
              {activeDragData.tab.favIconUrl ? (
                <img src={activeDragData.tab.favIconUrl} alt="" className="size-4 rounded-sm" />
              ) : (
                <div className="size-4 rounded-sm bg-muted" />
              )}
              <span className="max-w-[200px] truncate">
                {activeDragData.tab.title || activeDragData.tab.url}
              </span>
            </div>
          )}
      </DragOverlay>
    </DndContext>
  );
}
