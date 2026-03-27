import type { CollectionTab } from "@/lib/db";

export const DRAG_TYPES = {
  WORKSPACE: "workspace",
  LIVE_TAB: "live-tab",
  COLLECTION_TAB: "collection-tab",
  COLLECTION_DROP: "collection-drop",
} as const;

export interface WorkspaceDragData {
  type: typeof DRAG_TYPES.WORKSPACE;
}

export interface LiveTabDragData {
  type: typeof DRAG_TYPES.LIVE_TAB;
  tab: chrome.tabs.Tab;
}

export interface CollectionTabDragData {
  type: typeof DRAG_TYPES.COLLECTION_TAB;
  tab: CollectionTab;
  collectionId: number;
}

export interface CollectionDropData {
  type: typeof DRAG_TYPES.COLLECTION_DROP;
  collectionId: number;
}

export type DragData =
  | WorkspaceDragData
  | LiveTabDragData
  | CollectionTabDragData
  | CollectionDropData;
