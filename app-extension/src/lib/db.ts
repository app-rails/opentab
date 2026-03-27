import Dexie, { type EntityTable } from "dexie";
import { generateKeyBetween } from "fractional-indexing";

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
  icon: string;
  isDefault: boolean;
  order: string;
  createdAt: number;
}

export interface TabCollection {
  id?: number;
  workspaceId: number;
  name: string;
  order: string;
  createdAt: number;
}

export interface CollectionTab {
  id?: number;
  collectionId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  order: string;
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

db.version(2)
  .stores({
    accounts: "++id, accountId",
    workspaces: "++id, accountId, order",
    tabCollections: "++id, [workspaceId+order]",
    collectionTabs: "++id, [collectionId+order]",
    settings: "key",
  })
  .upgrade(async (tx) => {
    // Migrate workspaces: add icon, isDefault, convert order to string
    const workspaces = await tx.table("workspaces").orderBy("order").toArray();
    let prevKey: string | null = null;
    for (let i = 0; i < workspaces.length; i++) {
      const newKey = generateKeyBetween(prevKey, null);
      await tx.table("workspaces").update(workspaces[i].id, {
        icon: "folder",
        isDefault: i === 0,
        order: newKey,
      });
      prevKey = newKey;
    }

    // Migrate tabCollections: convert order to string
    const collections = await tx.table("tabCollections").toArray();
    const collectionsByWs = new Map<number, typeof collections>();
    for (const c of collections) {
      const group = collectionsByWs.get(c.workspaceId) ?? [];
      group.push(c);
      collectionsByWs.set(c.workspaceId, group);
    }
    for (const group of collectionsByWs.values()) {
      group.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
      let pk: string | null = null;
      for (const c of group) {
        const nk = generateKeyBetween(pk, null);
        await tx.table("tabCollections").update(c.id, { order: nk });
        pk = nk;
      }
    }

    // Migrate collectionTabs: convert order to string
    const tabs = await tx.table("collectionTabs").toArray();
    const tabsByCol = new Map<number, typeof tabs>();
    for (const t of tabs) {
      const group = tabsByCol.get(t.collectionId) ?? [];
      group.push(t);
      tabsByCol.set(t.collectionId, group);
    }
    for (const group of tabsByCol.values()) {
      group.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
      let pk: string | null = null;
      for (const t of group) {
        const nk = generateKeyBetween(pk, null);
        await tx.table("collectionTabs").update(t.id, { order: nk });
        pk = nk;
      }
    }
  });

export { db };
