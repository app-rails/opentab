import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tabCollections = sqliteTable(
  "tab_collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("sync_id").notNull(),
    userId: text("user_id").notNull(),
    workspaceSyncId: text("workspace_sync_id").notNull(),
    name: text("name").notNull(),
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
    uniqueIndex("tab_collections_user_sync_unique").on(table.userId, table.syncId),
    index("tab_collections_user_workspace_idx").on(table.userId, table.workspaceSyncId),
  ],
);
