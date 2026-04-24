# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenTab is a Chrome extension for managing browser tabs with workspaces and collections. It runs **local-first** (IndexedDB via Dexie). Phase 1 will add cloud sync via `apps/cloud` (React Router 7 + Cloudflare Workers).

**Monorepo layout (Phase 0)**: `apps/extension/` (Chrome extension), `packages/` (shared libraries: config, protocol, shared, ui).

## Commands

```bash
pnpm install                                # Install dependencies
pnpm dev                                    # Start all packages (turbo)
pnpm --filter @opentab/extension dev        # Extension only
pnpm build                                  # Production build (turbo)
pnpm lint                                   # TypeScript check + Biome lint (turbo)
pnpm format                                 # Auto-format with Biome
pnpm check                                  # Check formatting with Biome
```

Build output: `apps/extension/.output/chrome-mv3/` — load unpacked in `chrome://extensions/`.

## Code Style (Biome)

- 2-space indentation, 100-char line width
- Double quotes, trailing commas, always semicolons
- `noNonNullAssertion` is disabled (non-null assertions `!` are allowed)
- Run `pnpm format` before committing

## Architecture

### Extension (`apps/extension/`)

- **WXT** (v0.20) bundles the extension; entry points live in `src/entrypoints/`
- **Zustand** store in `src/stores/app-store.ts` is the single source of truth for workspaces, collections, tabs, and live browser tabs
- **Dexie** schema in `src/lib/db.ts` defines IndexedDB tables: Accounts, Workspaces, TabCollections, CollectionTabs, Settings, ImportSessions
- **Fractional indexing** for drag-and-drop ordering (via `fractional-indexing` package)
- **@dnd-kit** for drag-and-drop interactions
- **shadcn/ui** components in `packages/ui/` (shared across apps)
- **i18next** for internationalization; locale files in `src/locales/`
- Path alias: `@/` maps to `./src/`

### Cloud (`apps/cloud/`)

**Phase 1 feature** — coming soon. See [Phase 1 design spec](../docs/superpowers/specs/2026-04-24-apps-cloud-design.md) and [Phase 1 plan](../docs/superpowers/plans/2026-04-24-apps-cloud.md).

### Offline & Sync (Phase 0)

Extension runs offline-only in Phase 0. All CRUD operations go through Dexie (IndexedDB). Phase 1 will introduce an explicit setup wizard for server sync via `apps/cloud`.

## Key Patterns

- **Radix UI + Dialog**: When triggering a Dialog from a DropdownMenu, use `onCloseAutoFocus` with a ref to prevent focus from returning to the trigger — avoids `aria-hidden` warnings. Always include `DialogDescription` in `DialogContent`.
- **Chrome APIs**: The extension uses `chrome.storage`, `chrome.alarms`, `chrome.tabs`, and `chrome.downloads` permissions (declared in `wxt.config.ts`).
- **Dexie (IndexedDB)**: All CRUD operations go through Dexie. Phase 1 will introduce server sync as an optional secondary layer.
- **Extension icons**: WXT auto-detects `public/icon/{16,32,48,96,128}.png` for the manifest `icons` field. When adding or changing visual assets (logo, favicon), always keep `public/icon/` and `public/favicon*` in sync.
