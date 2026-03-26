import { create } from "zustand";
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";

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

export const useAppStore = create<AppState>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  collections: [],
  activeCollectionId: null,
  tabs: [],
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });

    const workspaces = await db.workspaces.orderBy("order").toArray();
    const activeWorkspaceId = workspaces[0]?.id ?? null;

    let collections: TabCollection[] = [];
    if (activeWorkspaceId != null) {
      collections = await db.tabCollections
        .where("workspaceId")
        .equals(activeWorkspaceId)
        .sortBy("order");
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
    set({ activeWorkspaceId: id, collections: [], activeCollectionId: null, tabs: [] });
    db.tabCollections
      .where("workspaceId")
      .equals(id)
      .sortBy("order")
      .then((collections) => {
        set({
          collections,
          activeCollectionId: collections[0]?.id ?? null,
        });
      })
      .catch((err) => console.error("[store] failed to load collections:", err));
  },

  setActiveCollection: (id) => {
    set({ activeCollectionId: id, tabs: [] });
    db.collectionTabs
      .where("collectionId")
      .equals(id)
      .sortBy("order")
      .then((tabs) => {
        set({ tabs });
      })
      .catch((err) => console.error("[store] failed to load tabs:", err));
  },
}));
