import Dexie, { type EntityTable } from "dexie";

export interface Account {
  id?: number;
  accountId: string;
  mode: "online" | "offline";
  createdAt: number;
}

export interface Workspace {
  id?: number;
  accountId: string;
  name: string;
  order: number;
  createdAt: number;
}

export interface TabCollection {
  id?: number;
  workspaceId: number;
  name: string;
  order: number;
  createdAt: number;
}

export interface CollectionTab {
  id?: number;
  collectionId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  order: number;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: string;
}

const db = new Dexie("OpenTabDB") as Dexie & {
  accounts: EntityTable<Account, "id">;
  workspaces: EntityTable<Workspace, "id">;
  tabCollections: EntityTable<TabCollection, "id">;
  collectionTabs: EntityTable<CollectionTab, "id">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  accounts: "++id, accountId",
  workspaces: "++id, accountId, order",
  tabCollections: "++id, [workspaceId+order]",
  collectionTabs: "++id, [collectionId+order]",
  settings: "key",
});

export { db };
