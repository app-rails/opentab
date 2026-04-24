import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const collectionTabs = sqliteTable(
  "collection_tabs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("sync_id").notNull(),
    userId: text("user_id").notNull(),
    collectionSyncId: text("collection_sync_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    favIconUrl: text("fav_icon_url"),
    order: text("order").notNull(),
    lastOpId: text("last_op_id").notNull().default(""),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("collection_tabs_user_sync_unique").on(table.userId, table.syncId),
    index("collection_tabs_user_collection_idx").on(table.userId, table.collectionSyncId),
  ],
);
