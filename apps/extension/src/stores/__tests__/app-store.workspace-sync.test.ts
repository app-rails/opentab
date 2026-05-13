import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/lib/settings";

const mocks = vi.hoisted(() => ({
  accountId: "account-1",
  workspaces: [] as unknown[],
  collectionsByWorkspace: new Map<number, unknown[]>(),
  tabsByCollection: new Map<number, unknown[]>(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  resolveAccountId: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getSettings: mocks.getSettings,
  updateSettings: mocks.updateSettings,
}));

vi.mock("@/lib/resolve-account-id", () => ({
  resolveAccountId: mocks.resolveAccountId,
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspaces: {
      where: () => ({
        equals: () => ({
          filter: () => ({
            sortBy: () => Promise.resolve(mocks.workspaces),
          }),
        }),
      }),
    },
    tabCollections: {},
    collectionTabs: {},
  },
}));

vi.mock("@/lib/db-queries", () => ({
  activeCollections: (workspaceId: number) => ({
    sortBy: () => Promise.resolve(mocks.collectionsByWorkspace.get(workspaceId) ?? []),
  }),
  activeTabs: (collectionId: number) => ({
    sortBy: () => Promise.resolve(mocks.tabsByCollection.get(collectionId) ?? []),
  }),
}));

import { useAppStore } from "@/stores/app-store";

const defaultSettings: AppSettings = {
  server_enabled: false,
  server_url: "",
  theme: "system",
  locale: "en",
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
  sync_polling_interval: 600_000,
  active_workspace_id: null,
  save_tabs_close_after: false,
};

const workspace1 = {
  id: 1,
  accountId: mocks.accountId,
  name: "One",
  icon: "folder",
  order: "a0",
  syncId: "workspace-1",
  createdAt: 1,
  updatedAt: 1,
};

const workspace2 = {
  id: 2,
  accountId: mocks.accountId,
  name: "Two",
  icon: "folder",
  order: "a1",
  syncId: "workspace-2",
  createdAt: 1,
  updatedAt: 1,
};

beforeEach(() => {
  mocks.workspaces.length = 0;
  mocks.workspaces.push(workspace1, workspace2);
  mocks.collectionsByWorkspace.clear();
  mocks.tabsByCollection.clear();
  mocks.getSettings.mockReset();
  mocks.updateSettings.mockReset();
  mocks.resolveAccountId.mockReset();
  mocks.sendMessage.mockReset();
  mocks.resolveAccountId.mockResolvedValue(mocks.accountId);
  mocks.getSettings.mockResolvedValue(defaultSettings);
  mocks.updateSettings.mockResolvedValue(undefined);
  mocks.sendMessage.mockResolvedValue(undefined);

  globalThis.chrome = {
    runtime: {
      sendMessage: mocks.sendMessage,
    },
  } as unknown as typeof chrome;

  useAppStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
    collections: [],
    tabsByCollection: new Map(),
    liveTabs: [],
    liveTabUrls: new Set(),
    isLoading: true,
    focusCollectionId: null,
  });
});

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = undefined;
});

describe("workspace active-state sync", () => {
  it("broadcasts workspace changes only after the active workspace is persisted", async () => {
    let resolvePersist: () => void = () => {};
    mocks.updateSettings.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePersist = resolve;
      }),
    );
    useAppStore.setState({ activeWorkspaceId: 1 });

    useAppStore.getState().setActiveWorkspace(2);

    expect(mocks.updateSettings).toHaveBeenCalledWith({ active_workspace_id: 2 });
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    resolvePersist();
    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith({
        type: "WORKSPACE_CHANGED",
        workspaceId: 2,
      });
    });
    expect(mocks.updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendMessage.mock.invocationCallOrder[0],
    );
  });

  it("does not let initialize overwrite a workspace broadcast received while loading", async () => {
    const collectionForWorkspace2 = {
      id: 20,
      workspaceId: 2,
      name: "Collection Two",
      order: "a0",
      syncId: "collection-2",
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.collectionsByWorkspace.set(2, [collectionForWorkspace2]);

    let resolveSettings: (settings: AppSettings) => void = () => {};
    mocks.getSettings.mockReturnValue(
      new Promise<AppSettings>((resolve) => {
        resolveSettings = resolve;
      }),
    );

    const initialize = useAppStore.getState().initialize();
    await waitFor(() => expect(mocks.getSettings).toHaveBeenCalled());

    useAppStore.getState().applyActiveWorkspaceFromBroadcast(2);
    await waitFor(() =>
      expect(useAppStore.getState().collections).toEqual([collectionForWorkspace2]),
    );

    resolveSettings({ ...defaultSettings, active_workspace_id: 1 });
    await initialize;

    expect(useAppStore.getState().activeWorkspaceId).toBe(2);
    expect(useAppStore.getState().collections).toEqual([collectionForWorkspace2]);
    expect(useAppStore.getState().workspaces).toEqual([workspace1, workspace2]);
    expect(useAppStore.getState().isLoading).toBe(false);
  });
});
