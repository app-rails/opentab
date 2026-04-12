import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const syncWorkspaces = sqliteTable(
  "syncWorkspaces",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("syncId").notNull(),
    userId: text("userId").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default(""),
    viewMode: text("viewMode"),
    order: text("order").notNull(),
    lastOpId: text("lastOpId").notNull().default(""),
    deletedAt: integer("deletedAt", { mode: "number" }),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("syncWorkspaces_userId_syncId_idx").on(table.userId, table.syncId),
    index("syncWorkspaces_userId_order_idx").on(table.userId, table.order),
  ],
);

export const syncTabCollections = sqliteTable(
  "syncTabCollections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("syncId").notNull(),
    userId: text("userId").notNull(),
    workspaceSyncId: text("workspaceSyncId").notNull(),
    name: text("name").notNull(),
    order: text("order").notNull(),
    lastOpId: text("lastOpId").notNull().default(""),
    deletedAt: integer("deletedAt", { mode: "number" }),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("syncTabCollections_userId_syncId_idx").on(table.userId, table.syncId)],
);

export const syncCollectionTabs = sqliteTable(
  "syncCollectionTabs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("syncId").notNull(),
    userId: text("userId").notNull(),
    collectionSyncId: text("collectionSyncId").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    favIconUrl: text("favIconUrl"),
    order: text("order").notNull(),
    lastOpId: text("lastOpId").notNull().default(""),
    deletedAt: integer("deletedAt", { mode: "number" }),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("syncCollectionTabs_userId_syncId_idx").on(table.userId, table.syncId)],
);

export const appliedOps = sqliteTable(
  "appliedOps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("userId").notNull(),
    opId: text("opId").notNull(),
    appliedAt: integer("appliedAt", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("appliedOps_userId_opId_idx").on(table.userId, table.opId)],
);

export const changeLog = sqliteTable(
  "changeLog",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    userId: text("userId").notNull(),
    entityType: text("entityType").notNull(),
    entitySyncId: text("entitySyncId").notNull(),
    action: text("action").notNull(),
    opId: text("opId").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
  },
  (table) => [index("changeLog_userId_seq_idx").on(table.userId, table.seq)],
);
