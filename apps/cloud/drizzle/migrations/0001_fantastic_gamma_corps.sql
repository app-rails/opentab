CREATE TABLE `extension_setup_exchanges` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`nonce` text NOT NULL,
	`callback_url` text NOT NULL,
	`device_name` text,
	`platform` text,
	`extension_version` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `extension_setup_exchanges_code_hash_unique` ON `extension_setup_exchanges` (`code_hash`);--> statement-breakpoint
CREATE INDEX `extension_setup_exchanges_user_idx` ON `extension_setup_exchanges` (`user_id`);--> statement-breakpoint
CREATE INDEX `extension_setup_exchanges_expires_idx` ON `extension_setup_exchanges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sync_applied_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`op_id` text NOT NULL,
	`applied_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_applied_logs_user_op_unique` ON `sync_applied_logs` (`user_id`,`op_id`);--> statement-breakpoint
CREATE TABLE `sync_change_logs` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_sync_id` text NOT NULL,
	`action` text NOT NULL,
	`op_id` text NOT NULL,
	`payload` text NOT NULL,
	`device_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_change_logs_user_seq_idx` ON `sync_change_logs` (`user_id`,`seq`);--> statement-breakpoint
CREATE TABLE `collection_tabs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`user_id` text NOT NULL,
	`collection_sync_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`fav_icon_url` text,
	`order` text NOT NULL,
	`last_op_id` text DEFAULT '' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_tabs_user_sync_unique` ON `collection_tabs` (`user_id`,`sync_id`);--> statement-breakpoint
CREATE INDEX `collection_tabs_user_collection_idx` ON `collection_tabs` (`user_id`,`collection_sync_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text,
	`extension_version` text,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_seen_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE INDEX `devices_user_idx` ON `devices` (`user_id`);--> statement-breakpoint
CREATE TABLE `tab_collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`user_id` text NOT NULL,
	`workspace_sync_id` text NOT NULL,
	`name` text NOT NULL,
	`order` text NOT NULL,
	`last_op_id` text DEFAULT '' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tab_collections_user_sync_unique` ON `tab_collections` (`user_id`,`sync_id`);--> statement-breakpoint
CREATE INDEX `tab_collections_user_workspace_idx` ON `tab_collections` (`user_id`,`workspace_sync_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`view_mode` text,
	`order` text NOT NULL,
	`last_op_id` text DEFAULT '' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_user_sync_unique` ON `workspaces` (`user_id`,`sync_id`);--> statement-breakpoint
CREATE INDEX `workspaces_user_idx` ON `workspaces` (`user_id`);