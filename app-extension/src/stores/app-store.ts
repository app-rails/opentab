import { create } from "zustand";
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";

function loadCollections(workspaceId: number) {
  return db.tabCollections.where("workspaceId").equals(workspaceId).sortBy("order");
}

interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: number | null;
  collections: TabCollection[];
  activeCollectionId: number | null;
  tabs: CollectionTab[];
  isLoading: boolean;

  initialize: () => Promise<void>;
  setActiveWorkspace: (id: number) => void;
  setActiveCollection: (id: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  collections: [],
  activeCollectionId: null,
  tabs: [],
  isLoading: true,

  initialize: async () => {
    const workspaces = await db.workspaces.orderBy("order").toArray();
    const activeWorkspaceId = workspaces[0]?.id ?? null;

    let collections: TabCollection[] = [];
    if (activeWorkspaceId != null) {
      collections = await loadCollections(activeWorkspaceId);
    }

    set({
      workspaces,
      activeWorkspaceId,
      collections,
      activeCollectionId: collections[0]?.id ?? null,
      tabs: [],
      isLoading: false,
    });
  },

  setActiveWorkspace: (id) => {
    if (get().activeWorkspaceId === id) return;
    set({ activeWorkspaceId: id, collections: [], activeCollectionId: null, tabs: [] });
    loadCollections(id)
      .then((collections) => {
        if (get().activeWorkspaceId !== id) return;
        set({
          collections,
          activeCollectionId: collections[0]?.id ?? null,
        });
      })
      .catch((err) => console.error("[store] failed to load collections:", err));
  },

  setActiveCollection: (id) => {
    if (get().activeCollectionId === id) return;
    set({ activeCollectionId: id, tabs: [] });
    db.collectionTabs
      .where("collectionId")
      .equals(id)
      .sortBy("order")
      .then((tabs) => {
        if (get().activeCollectionId !== id) return;
        set({ tabs });
      })
      .catch((err) => console.error("[store] failed to load tabs:", err));
  },
}));
