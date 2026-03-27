import Dexie from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import { create } from "zustand";
import { getAuthState } from "@/lib/auth-storage";
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";
import { DEFAULT_ICON, WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";

function loadCollections(workspaceId: number) {
  return db.tabCollections
    .where("[workspaceId+order]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .toArray();
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    return trimmed.slice(0, WORKSPACE_NAME_MAX_LENGTH);
  }
  return trimmed;
}

async function resolveAccountId(): Promise<string> {
  const authState = await getAuthState();
  if (authState?.mode === "online") return authState.accountId;
  if (authState?.mode === "offline") return authState.localUuid;
  return "unknown";
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

  // Workspace CRUD
  createWorkspace: (name: string, icon: string) => Promise<void>;
  renameWorkspace: (id: number, name: string) => Promise<void>;
  changeWorkspaceIcon: (id: number, icon: string) => Promise<void>;
  deleteWorkspace: (id: number) => Promise<void>;
  reorderWorkspace: (id: number, newOrder: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  collections: [],
  activeCollectionId: null,
  tabs: [],
  isLoading: true,

  initialize: async () => {
    try {
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
    } catch (err) {
      console.error("[store] failed to initialize:", err);
      set({ isLoading: false });
    }
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
      .where("[collectionId+order]")
      .between([id, Dexie.minKey], [id, Dexie.maxKey])
      .toArray()
      .then((tabs) => {
        if (get().activeCollectionId !== id) return;
        set({ tabs });
      })
      .catch((err) => console.error("[store] failed to load tabs:", err));
  },

  createWorkspace: async (name, icon) => {
    const validName = validateName(name);
    if (!validName) return;
    const { workspaces } = get();
    const lastOrder = workspaces.length > 0 ? workspaces[workspaces.length - 1].order : null;
    const newOrder = generateKeyBetween(lastOrder, null);

    const id = await db.workspaces.add({
      accountId: await resolveAccountId(),
      name: validName,
      icon: icon || DEFAULT_ICON,
      isDefault: false,
      order: newOrder,
      createdAt: Date.now(),
    });

    const workspace = await db.workspaces.get(id);
    if (workspace) {
      set({ workspaces: [...get().workspaces, workspace] });
    }
  },

  renameWorkspace: async (id, name) => {
    const validName = validateName(name);
    if (!validName) return;
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic update
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, name: validName } : w)),
    });

    try {
      await db.workspaces.update(id, { name: validName });
    } catch (err) {
      console.error("[store] failed to rename workspace:", err);
      // Revert
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  changeWorkspaceIcon: async (id, icon) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic update
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, icon } : w)),
    });

    try {
      await db.workspaces.update(id, { icon });
    } catch (err) {
      console.error("[store] failed to change workspace icon:", err);
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  deleteWorkspace: async (id) => {
    const { workspaces, activeWorkspaceId } = get();
    const target = workspaces.find((w) => w.id === id);
    if (!target || target.isDefault) return;

    // Cascade delete in transaction
    await db.transaction("rw", [db.workspaces, db.tabCollections, db.collectionTabs], async () => {
      const collections = await db.tabCollections.where("workspaceId").equals(id).toArray();
      const collectionIds = collections.map((c) => c.id!);
      if (collectionIds.length > 0) {
        await db.collectionTabs.where("collectionId").anyOf(collectionIds).delete();
      }
      await db.tabCollections.where("workspaceId").equals(id).delete();
      await db.workspaces.delete(id);
    });

    const remaining = workspaces.filter((w) => w.id !== id);
    const needSwitch = activeWorkspaceId === id;
    const defaultWs = remaining.find((w) => w.isDefault) ?? remaining[0];

    set({ workspaces: remaining });

    if (needSwitch && defaultWs?.id != null) {
      get().setActiveWorkspace(defaultWs.id);
    }
  },

  reorderWorkspace: async (id, newOrder) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic: update order and re-sort
    const updated = workspaces
      .map((w) => (w.id === id ? { ...w, order: newOrder } : w))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

    set({ workspaces: updated });

    try {
      await db.workspaces.update(id, { order: newOrder });
    } catch (err) {
      console.error("[store] failed to reorder workspace:", err);
      set({
        workspaces: [...workspaces].sort((a, b) =>
          a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
        ),
      });
    }
  },
}));
