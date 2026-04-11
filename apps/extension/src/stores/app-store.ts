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
import type { ViewMode } from "@/lib/view-mode";

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

function buildLiveTabUrls(tabs: chrome.tabs.Tab[]): Set<string> {
  return new Set(tabs.map((t) => t.url).filter((u): u is string => u != null));
}

export async function resolveAccountId(): Promise<string> {
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
  liveTabUrls: Set<string>;
  isLoading: boolean;

  initialize: () => Promise<void>;
  setActiveWorkspace: (id: number) => void;

  // Workspace CRUD (existing)
  createWorkspace: (name: string, icon: string) => Promise<void>;
  renameWorkspace: (id: number, name: string) => Promise<void>;
  changeWorkspaceIcon: (id: number, icon: string) => Promise<void>;
  setWorkspaceViewMode: (id: number, mode: ViewMode) => Promise<void>;
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
  updateTab: (
    tabId: number,
    collectionId: number,
    updates: { title: string; url: string; favIconUrl?: string },
  ) => Promise<void>;

  // Move tab across collections
  moveTabToCollection: (
    tabId: number,
    sourceCollectionId: number,
    targetCollectionId: number,
    targetOrder: string,
  ) => Promise<void>;

  // Restore
  restoreCollection: (collectionId: number) => Promise<void>;

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
  liveTabUrls: new Set(),
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
    set({ activeWorkspaceId: id });
    loadCollections(id)
      .then(async (collections) => {
        if (get().activeWorkspaceId !== id) return;
        const tabsByCollection = await loadTabsByCollection(collections);
        if (get().activeWorkspaceId !== id) return;
        set({ collections, tabsByCollection });
      })
      .catch((err) => {
        console.error("[store] failed to load collections:", err);
        if (get().activeWorkspaceId === id) {
          set({ collections: [], tabsByCollection: new Map() });
        }
      });
  },

  // Live tabs
  setLiveTabs: (tabs) =>
    set({
      liveTabs: tabs,
      liveTabUrls: buildLiveTabUrls(tabs),
    }),

  addLiveTab: (tab) => {
    if (get().liveTabs.some((t) => t.id === tab.id)) return;
    const newTabs = [...get().liveTabs, tab];
    set({
      liveTabs: newTabs,
      liveTabUrls: buildLiveTabUrls(newTabs),
    });
  },

  removeLiveTab: (tabId) => {
    const { liveTabs } = get();
    if (!liveTabs.some((t) => t.id === tabId)) return;
    const newTabs = liveTabs.filter((t) => t.id !== tabId);
    set({
      liveTabs: newTabs,
      liveTabUrls: buildLiveTabUrls(newTabs),
    });
  },

  updateLiveTab: (tabId, changeInfo) => {
    const keys = Object.keys(changeInfo) as (keyof chrome.tabs.OnUpdatedInfo)[];
    if (keys.length === 0) return;
    const { liveTabs } = get();
    const idx = liveTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const existing = liveTabs[idx];
    if (keys.every((k) => existing[k as keyof chrome.tabs.Tab] === changeInfo[k])) return;
    const newTabs = liveTabs.map((t) => (t.id === tabId ? { ...t, ...changeInfo } : t));
    const urlChanged = "url" in changeInfo;
    set({
      liveTabs: newTabs,
      ...(urlChanged && { liveTabUrls: buildLiveTabUrls(newTabs) }),
    });
  },

  createWorkspace: async (name, icon) => {
    const validName = validateName(name);
    if (!validName) return;
    const { workspaces } = get();
    const sorted = [...workspaces].sort(compareByOrder);
    const firstOrder = sorted.length > 0 ? sorted[0].order : null;
    const newOrder = generateKeyBetween(null, firstOrder);

    const now = Date.now();
    const workspace: Workspace = {
      accountId: await resolveAccountId(),
      name: validName,
      icon: validatedIcon(icon),
      order: newOrder,
      createdAt: now,
      updatedAt: now,
    };
    const id = await db.workspaces.add(workspace);
    workspace.id = id as number;
    const updatedWorkspaces = [...get().workspaces, workspace];
    set({ workspaces: updatedWorkspaces });

    if (get().activeWorkspaceId == null) {
      get().setActiveWorkspace(id as number);
    }
  },

  renameWorkspace: async (id, name) => {
    const validName = validateName(name);
    if (!validName) return;
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    const now = Date.now();
    set({
      workspaces: workspaces.map((w) =>
        w.id === id ? { ...w, name: validName, updatedAt: now } : w,
      ),
    });

    try {
      await db.workspaces.update(id, { name: validName, updatedAt: now });
    } catch (err) {
      console.error("[store] failed to rename workspace:", err);
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  changeWorkspaceIcon: async (id, icon) => {
    const validIcon = validatedIcon(icon);
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    const now = Date.now();
    set({
      workspaces: workspaces.map((w) =>
        w.id === id ? { ...w, icon: validIcon, updatedAt: now } : w,
      ),
    });

    try {
      await db.workspaces.update(id, { icon: validIcon, updatedAt: now });
    } catch (err) {
      console.error("[store] failed to change workspace icon:", err);
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  setWorkspaceViewMode: async (id, mode) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;
    if (prev.viewMode === mode) return;

    const now = Date.now();
    set({
      workspaces: workspaces.map((w) =>
        w.id === id ? { ...w, viewMode: mode, updatedAt: now } : w,
      ),
    });

    try {
      await db.workspaces.update(id, { viewMode: mode, updatedAt: now });
    } catch (err) {
      console.error("[store] failed to set workspace view mode:", err);
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  deleteWorkspace: async (id) => {
    const { workspaces, activeWorkspaceId } = get();
    const target = workspaces.find((w) => w.id === id);
    if (!target || workspaces.length <= 1) return;

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
    const defaultWs = remaining[0];

    set({ workspaces: remaining, tabsByCollection: new Map() });

    if (needSwitch && defaultWs?.id != null) {
      get().setActiveWorkspace(defaultWs.id);
    }
  },

  reorderWorkspace: async (id, newOrder) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    const now = Date.now();
    const updated = workspaces
      .map((w) => (w.id === id ? { ...w, order: newOrder, updatedAt: now } : w))
      .sort(compareByOrder);
    set({ workspaces: updated });

    try {
      await db.workspaces.update(id, { order: newOrder, updatedAt: now });
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
    const firstOrder = sorted.length > 0 ? sorted[0].order : null;
    const newOrder = generateKeyBetween(null, firstOrder);

    const now = Date.now();
    const collection: TabCollection = {
      workspaceId: activeWorkspaceId,
      name: validName,
      order: newOrder,
      createdAt: now,
      updatedAt: now,
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

    const now = Date.now();
    set({
      collections: collections.map((c) =>
        c.id === id ? { ...c, name: validName, updatedAt: now } : c,
      ),
    });

    try {
      await db.tabCollections.update(id, { name: validName, updatedAt: now });
    } catch (err) {
      console.error("[store] failed to rename collection:", err);
      set({ collections: collections.map((c) => (c.id === id ? prev : c)) });
    }
  },

  deleteCollection: async (id) => {
    const { collections } = get();
    const collection = collections.find((c) => c.id === id);
    if (!collection) return;

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

    const now = Date.now();
    const updated = collections
      .map((c) => (c.id === id ? { ...c, order: newOrder, updatedAt: now } : c))
      .sort(compareByOrder);
    set({ collections: updated });

    try {
      await db.tabCollections.update(id, { order: newOrder, updatedAt: now });
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

    const now = Date.now();
    const newTab: CollectionTab = {
      collectionId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      order: newOrder,
      createdAt: now,
      updatedAt: now,
    };
    const id = await db.collectionTabs.add(newTab);
    newTab.id = id as number;

    const newMap = new Map(get().tabsByCollection);
    newMap.set(collectionId, [...(newMap.get(collectionId) ?? []), newTab]);
    set({ tabsByCollection: newMap });
  },

  removeTabFromCollection: async (tabId, collectionId) => {
    const { tabsByCollection, collections } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const now = Date.now();
    const newMap = new Map(tabsByCollection);
    newMap.set(
      collectionId,
      prevTabs.filter((t) => t.id !== tabId),
    );
    set({
      tabsByCollection: newMap,
      collections: collections.map((c) => (c.id === collectionId ? { ...c, updatedAt: now } : c)),
    });

    try {
      await db.collectionTabs.delete(tabId);
      await db.tabCollections.update(collectionId, { updatedAt: now });
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

    const now = Date.now();
    const updated = prevTabs
      .map((t) => (t.id === tabId ? { ...t, order: newOrder, updatedAt: now } : t))
      .sort(compareByOrder);

    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, updated);
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.update(tabId, { order: newOrder, updatedAt: now });
    } catch (err) {
      console.error("[store] failed to reorder tab:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
    }
  },

  updateTab: async (tabId, collectionId, updates) => {
    const { tabsByCollection } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const tabIndex = prevTabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const now = Date.now();
    const updatedTab = { ...prevTabs[tabIndex], ...updates, updatedAt: now };
    const newTabs = prevTabs.map((t) => (t.id === tabId ? updatedTab : t));

    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, newTabs);
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.update(tabId, { ...updates, updatedAt: now });
    } catch (err) {
      console.error("[store] failed to update tab:", err);
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
    const firstCollectionOrder = sorted.length > 0 ? sorted[0].order : null;
    const collectionOrder = generateKeyBetween(null, firstCollectionOrder);

    const now = Date.now();
    const collection: TabCollection = {
      workspaceId: activeWorkspaceId,
      name: validName,
      order: collectionOrder,
      createdAt: now,
      updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
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

  moveTabToCollection: async (tabId, sourceCollectionId, targetCollectionId, targetOrder) => {
    const { tabsByCollection } = get();
    const sourceTabs = tabsByCollection.get(sourceCollectionId);
    if (!sourceTabs) return;

    const tab = sourceTabs.find((t) => t.id === tabId);
    if (!tab) return;

    // Check for duplicate URL in target
    const targetTabs = tabsByCollection.get(targetCollectionId) ?? [];
    if (targetTabs.some((t) => t.url === tab.url)) return;

    const now = Date.now();
    const movedTab: CollectionTab = {
      ...tab,
      collectionId: targetCollectionId,
      order: targetOrder,
      updatedAt: now,
    };

    // Optimistic update — insert at correct position to avoid re-sorting
    const newTargetTabs = [...targetTabs];
    const insertIndex = newTargetTabs.findIndex((t) => t.order > targetOrder);
    if (insertIndex === -1) {
      newTargetTabs.push(movedTab);
    } else {
      newTargetTabs.splice(insertIndex, 0, movedTab);
    }

    const newMap = new Map(tabsByCollection);
    newMap.set(
      sourceCollectionId,
      sourceTabs.filter((t) => t.id !== tabId),
    );
    newMap.set(targetCollectionId, newTargetTabs);
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.update(tabId, {
        collectionId: targetCollectionId,
        order: targetOrder,
        updatedAt: now,
      });
    } catch (err) {
      console.error("[store] failed to move tab:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(sourceCollectionId, sourceTabs);
      revertMap.set(targetCollectionId, targetTabs);
      set({ tabsByCollection: revertMap });
    }
  },

  restoreCollection: async (collectionId) => {
    try {
      const { tabsByCollection } = get();
      const collectionTabs = tabsByCollection.get(collectionId);
      if (!collectionTabs || collectionTabs.length === 0) return;

      const { liveTabUrls } = get();
      const tabsToOpen = collectionTabs.filter((t) => !liveTabUrls.has(t.url));

      if (tabsToOpen.length === 0) return;

      // Optimistically mark URLs as open to prevent double-click duplicates
      const optimisticUrls = new Set(liveTabUrls);
      for (const tab of tabsToOpen) {
        optimisticUrls.add(tab.url);
      }
      set({ liveTabUrls: optimisticUrls });

      await Promise.all(
        tabsToOpen.map((tab) => chrome.tabs.create({ url: tab.url, active: false })),
      );
    } catch (err) {
      console.error("[store] failed to restore collection:", err);
    }
  },
}));
