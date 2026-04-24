import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const extensionSetupExchanges = sqliteTable(
  "extension_setup_exchanges",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    userId: text("user_id").notNull(),
    nonce: text("nonce").notNull(),
    callbackUrl: text("callback_url").notNull(),
    deviceName: text("device_name"),
    platform: text("platform"),
    extensionVersion: text("extension_version"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("extension_setup_exchanges_user_idx").on(table.userId),
    index("extension_setup_exchanges_expires_idx").on(table.expiresAt),
  ],
);
