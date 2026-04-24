import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const syncAppliedLogs = sqliteTable(
  "sync_applied_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    opId: text("op_id").notNull(),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [uniqueIndex("sync_applied_logs_user_op_unique").on(table.userId, table.opId)],
);
