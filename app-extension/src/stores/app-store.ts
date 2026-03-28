import Dexie from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import { create } from "zustand";
import { getAuthState } from "@/lib/auth-storage";
import {
  DEFAULT_ICON,
  WORKSPACE_ICON_OPTIONS,
  WORKSPACE_NAME_MAX_LENGTH,
  type WorkspaceIconName,
} from "@/lib/constants";
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";
import { compareByOrder } from "@/lib/utils";

function loadCollections(workspaceId: number) {
  return db.tabCollections
    .where("[workspaceId+order]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .toArray();
}

async function loadTabsByCollection(
  collections: TabCollection[],
): Promise<Map<number, CollectionTab[]>> {
  const ids = collections.map((c) => c.id).filter((id): id is number => id != null);
  const entries = await Promise.all(
    ids.map(async (id) => {
      const tabs = await db.collectionTabs
        .where("[collectionId+order]")
        .between([id, Dexie.minKey], [id, Dexie.maxKey])
        .toArray();
      return [id, tabs] as const;
    }),
  );
  return new Map(entries);
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    return trimmed.slice(0, WORKSPACE_NAME_MAX_LENGTH);
  }
  return trimmed;
}

function validatedIcon(icon: string): WorkspaceIconName {
  return WORKSPACE_ICON_OPTIONS.includes(icon as WorkspaceIconName)
    ? (icon as WorkspaceIconName)
    : DEFAULT_ICON;
}

async function resolveAccountId(): Promise<string> {
  const authState = await getAuthState();
  if (authState?.mode === "online") return authState.accountId;
  if (authState?.mode === "offline") return authState.localUuid;
  throw new Error("Cannot resolve accountId: auth state is not available");
}

interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: number | null;
  collections: TabCollection[];
  tabsByCollection: Map<number, CollectionTab[]>;
  liveTabs: chrome.tabs.Tab[];
  isLoading: boolean;

  initialize: () => Promise<void>;
  setActiveWorkspace: (id: number) => void;

  // Workspace CRUD (existing)
  createWorkspace: (name: string, icon: string) => Promise<void>;
  renameWorkspace: (id: number, name: string) => Promise<void>;
  changeWorkspaceIcon: (id: number, icon: string) => Promise<void>;
  deleteWorkspace: (id: number) => Promise<void>;
  reorderWorkspace: (id: number, newOrder: string) => Promise<void>;

  // Live tabs
  setLiveTabs: (tabs: chrome.tabs.Tab[]) => void;
  addLiveTab: (tab: chrome.tabs.Tab) => void;
  removeLiveTab: (tabId: number) => void;
  updateLiveTab: (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => void;

  // Collection CRUD
  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: number, name: string) => Promise<void>;
  deleteCollection: (id: number) => Promise<void>;
  reorderCollection: (id: number, newOrder: string) => Promise<void>;

  // Tab mutations
  addTabToCollection: (
    collectionId: number,
    tab: { url: string; title: string; favIconUrl?: string },
  ) => Promise<void>;
  removeTabFromCollection: (tabId: number, collectionId: number) => Promise<void>;
  reorderTabInCollection: (tabId: number, collectionId: number, newOrder: string) => Promise<void>;

  // Bulk save
  saveTabsAsCollection: (
    name: string,
    tabs: { url: string; title: string; favIconUrl?: string }[],
  ) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  collections: [],
  tabsByCollection: new Map(),
  liveTabs: [],
  isLoading: true,

  initialize: async () => {
    try {
      const workspaces = await db.workspaces.orderBy("order").toArray();
      const activeWorkspaceId = workspaces[0]?.id ?? null;

      let collections: TabCollection[] = [];
      let tabsByCollection = new Map<number, CollectionTab[]>();
      if (activeWorkspaceId != null) {
        collections = await loadCollections(activeWorkspaceId);
        tabsByCollection = await loadTabsByCollection(collections);
      }

      set({
        workspaces,
        activeWorkspaceId,
        collections,
        tabsByCollection,
        isLoading: false,
      });
    } catch (err) {
      console.error("[store] failed to initialize:", err);
      set({ isLoading: false });
    }
  },

  setActiveWorkspace: (id) => {
    if (get().activeWorkspaceId === id) return;
    set({ activeWorkspaceId: id, collections: [], tabsByCollection: new Map() });
    loadCollections(id)
      .then(async (collections) => {
        if (get().activeWorkspaceId !== id) return;
        const tabsByCollection = await loadTabsByCollection(collections);
        if (get().activeWorkspaceId !== id) return;
        set({ collections, tabsByCollection });
      })
      .catch((err) => console.error("[store] failed to load collections:", err));
  },

  // Live tabs
  setLiveTabs: (tabs) => set({ liveTabs: tabs }),

  addLiveTab: (tab) => {
    if (get().liveTabs.some((t) => t.id === tab.id)) return;
    set({ liveTabs: [...get().liveTabs, tab] });
  },

  removeLiveTab: (tabId) => {
    const { liveTabs } = get();
    if (!liveTabs.some((t) => t.id === tabId)) return;
    set({ liveTabs: liveTabs.filter((t) => t.id !== tabId) });
  },

  updateLiveTab: (tabId, changeInfo) => {
    const keys = Object.keys(changeInfo) as (keyof chrome.tabs.OnUpdatedInfo)[];
    if (keys.length === 0) return;
    const { liveTabs } = get();
    const idx = liveTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const existing = liveTabs[idx];
    if (keys.every((k) => existing[k as keyof chrome.tabs.Tab] === changeInfo[k])) return;
    set({
      liveTabs: liveTabs.map((t) => (t.id === tabId ? { ...t, ...changeInfo } : t)),
    });
  },

  createWorkspace: async (name, icon) => {
    const validName = validateName(name);
    if (!validName) return;
    const { workspaces } = get();
    const lastOrder = workspaces.length > 0 ? workspaces[workspaces.length - 1].order : null;
    const newOrder = generateKeyBetween(lastOrder, null);

    const workspace: Workspace = {
      accountId: await resolveAccountId(),
      name: validName,
      icon: validatedIcon(icon),
      isDefault: false,
      order: newOrder,
      createdAt: Date.now(),
    };
    const id = await db.workspaces.add(workspace);
    workspace.id = id as number;
    set({ workspaces: [...get().workspaces, workspace] });
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
    const validIcon = validatedIcon(icon);
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic update
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, icon: validIcon } : w)),
    });

    try {
      await db.workspaces.update(id, { icon: validIcon });
    } catch (err) {
      console.error("[store] failed to change workspace icon:", err);
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  deleteWorkspace: async (id) => {
    const { workspaces, activeWorkspaceId } = get();
    const target = workspaces.find((w) => w.id === id);
    if (!target || target.isDefault) return;

    try {
      await db.transaction(
        "rw",
        [db.workspaces, db.tabCollections, db.collectionTabs],
        async () => {
          const collections = await db.tabCollections.where("workspaceId").equals(id).toArray();
          const collectionIds = collections.map((c) => c.id!);
          if (collectionIds.length > 0) {
            await db.collectionTabs.where("collectionId").anyOf(collectionIds).delete();
          }
          await db.tabCollections.where("workspaceId").equals(id).delete();
          await db.workspaces.delete(id);
        },
      );
    } catch (err) {
      console.error("[store] failed to delete workspace:", err);
      return;
    }

    const remaining = workspaces.filter((w) => w.id !== id);
    const needSwitch = activeWorkspaceId === id;
    const defaultWs = remaining.find((w) => w.isDefault) ?? remaining[0];

    set({ workspaces: remaining, tabsByCollection: new Map() });

    if (needSwitch && defaultWs?.id != null) {
      get().setActiveWorkspace(defaultWs.id);
    }
  },

  reorderWorkspace: async (id, newOrder) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    const updated = workspaces
      .map((w) => (w.id === id ? { ...w, order: newOrder } : w))
      .sort(compareByOrder);
    set({ workspaces: updated });

    try {
      await db.workspaces.update(id, { order: newOrder });
    } catch (err) {
      console.error("[store] failed to reorder workspace:", err);
      set({ workspaces: [...workspaces].sort(compareByOrder) });
    }
  },

  // Collection CRUD
  createCollection: async (name) => {
    const validName = validateName(name);
    if (!validName) return;
    const { activeWorkspaceId, collections } = get();
    if (activeWorkspaceId == null) return;

    const sorted = [...collections].sort(compareByOrder);
    const lastOrder = sorted.length > 0 ? sorted[sorted.length - 1].order : null;
    const newOrder = generateKeyBetween(lastOrder, null);

    const collection: TabCollection = {
      workspaceId: activeWorkspaceId,
      name: validName,
      order: newOrder,
      createdAt: Date.now(),
    };
    const id = await db.tabCollections.add(collection);
    collection.id = id as number;

    const { tabsByCollection } = get();
    const newMap = new Map(tabsByCollection);
    newMap.set(id as number, []);
    set({
      collections: [...get().collections, collection],
      tabsByCollection: newMap,
    });
  },

  renameCollection: async (id, name) => {
    const validName = validateName(name);
    if (!validName) return;
    const { collections } = get();
    const prev = collections.find((c) => c.id === id);
    if (!prev) return;

    set({
      collections: collections.map((c) => (c.id === id ? { ...c, name: validName } : c)),
    });

    try {
      await db.tabCollections.update(id, { name: validName });
    } catch (err) {
      console.error("[store] failed to rename collection:", err);
      set({ collections: collections.map((c) => (c.id === id ? prev : c)) });
    }
  },

  deleteCollection: async (id) => {
    const { collections } = get();
    if (collections.length <= 1) return;
    const collection = collections.find((c) => c.id === id);
    if (!collection) return;
    if (collection.name === "Unsorted") return;

    try {
      await db.transaction("rw", [db.tabCollections, db.collectionTabs], async () => {
        await db.collectionTabs.where("collectionId").equals(id).delete();
        await db.tabCollections.delete(id);
      });
    } catch (err) {
      console.error("[store] failed to delete collection:", err);
      return;
    }

    const { tabsByCollection } = get();
    const newMap = new Map(tabsByCollection);
    newMap.delete(id);
    set({
      collections: collections.filter((c) => c.id !== id),
      tabsByCollection: newMap,
    });
  },

  reorderCollection: async (id, newOrder) => {
    const { collections } = get();
    const prev = collections.find((c) => c.id === id);
    if (!prev) return;

    const updated = collections
      .map((c) => (c.id === id ? { ...c, order: newOrder } : c))
      .sort(compareByOrder);
    set({ collections: updated });

    try {
      await db.tabCollections.update(id, { order: newOrder });
    } catch (err) {
      console.error("[store] failed to reorder collection:", err);
      set({ collections: [...collections].sort(compareByOrder) });
    }
  },

  // Tab mutations
  addTabToCollection: async (collectionId, tab) => {
    const { tabsByCollection } = get();
    const existingTabs = tabsByCollection.get(collectionId) ?? [];

    if (existingTabs.some((t) => t.url === tab.url)) return;

    const lastOrder = existingTabs.length > 0 ? existingTabs[existingTabs.length - 1].order : null;
    const newOrder = generateKeyBetween(lastOrder, null);

    const newTab: CollectionTab = {
      collectionId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      order: newOrder,
      createdAt: Date.now(),
    };
    const id = await db.collectionTabs.add(newTab);
    newTab.id = id as number;

    const newMap = new Map(get().tabsByCollection);
    newMap.set(collectionId, [...(newMap.get(collectionId) ?? []), newTab]);
    set({ tabsByCollection: newMap });
  },

  removeTabFromCollection: async (tabId, collectionId) => {
    const { tabsByCollection } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const newMap = new Map(tabsByCollection);
    newMap.set(
      collectionId,
      prevTabs.filter((t) => t.id !== tabId),
    );
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.delete(tabId);
    } catch (err) {
      console.error("[store] failed to remove tab:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
    }
  },

  reorderTabInCollection: async (tabId, collectionId, newOrder) => {
    const { tabsByCollection } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const updated = prevTabs
      .map((t) => (t.id === tabId ? { ...t, order: newOrder } : t))
      .sort(compareByOrder);

    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, updated);
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.update(tabId, { order: newOrder });
    } catch (err) {
      console.error("[store] failed to reorder tab:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
    }
  },

  saveTabsAsCollection: async (name, tabs) => {
    const validName = validateName(name);
    if (!validName || tabs.length === 0) return;
    const { activeWorkspaceId, collections } = get();
    if (activeWorkspaceId == null) return;

    const sorted = [...collections].sort(compareByOrder);
    const lastCollectionOrder = sorted.length > 0 ? sorted[sorted.length - 1].order : null;
    const collectionOrder = generateKeyBetween(lastCollectionOrder, null);

    const collection: TabCollection = {
      workspaceId: activeWorkspaceId,
      name: validName,
      order: collectionOrder,
      createdAt: Date.now(),
    };

    const collectionTabs: CollectionTab[] = [];
    let prevTabOrder: string | null = null;
    for (const tab of tabs) {
      const tabOrder = generateKeyBetween(prevTabOrder, null);
      collectionTabs.push({
        collectionId: -1,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        order: tabOrder,
        createdAt: Date.now(),
      });
      prevTabOrder = tabOrder;
    }

    try {
      const collectionId = await db.transaction(
        "rw",
        [db.tabCollections, db.collectionTabs],
        async () => {
          const id = (await db.tabCollections.add(collection)) as number;
          const withId = collectionTabs.map((t) => ({ ...t, collectionId: id }));
          await db.collectionTabs.bulkAdd(withId);
          return id;
        },
      );

      collection.id = collectionId;

      // Reload from DB to get correct auto-increment IDs
      const freshTabs = await db.collectionTabs
        .where("[collectionId+order]")
        .between([collectionId, Dexie.minKey], [collectionId, Dexie.maxKey])
        .toArray();

      const newMap = new Map(get().tabsByCollection);
      newMap.set(collectionId, freshTabs);
      set({
        collections: [...get().collections, collection],
        tabsByCollection: newMap,
      });
    } catch (err) {
      console.error("[store] failed to save tabs as collection:", err);
    }
  },
}));
