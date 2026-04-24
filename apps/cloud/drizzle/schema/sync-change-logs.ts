import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const syncChangeLogs = sqliteTable(
  "sync_change_logs",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    entityType: text("entity_type").notNull(),
    entitySyncId: text("entity_sync_id").notNull(),
    action: text("action").notNull(),
    opId: text("op_id").notNull(),
    payload: text("payload").notNull(),
    deviceId: text("device_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("sync_change_logs_user_seq_idx").on(table.userId, table.seq)],
);
