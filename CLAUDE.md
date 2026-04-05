# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenTab is a Chrome extension for managing browser tabs with workspaces and collections. It runs **local-first** (IndexedDB via Dexie) with optional server sync (Hono + better-auth).

**Monorepo layout**: `app-extension/` (Chrome extension), `app-server/` (backend), `packages/shared/` (types).

## Commands

```bash
pnpm install                                # Install dependencies
pnpm dev                                    # Start all packages (turbo)
pnpm --filter @opentab/extension dev        # Extension only
pnpm --filter @opentab/server dev           # Server only
pnpm build                                  # Production build (turbo)
pnpm lint                                   # TypeScript check + Biome lint (turbo)
pnpm format                                 # Auto-format with Biome
pnpm check                                  # Check formatting with Biome

# Server tests
cd app-server && pnpm test                  # Run all vitest tests
cd app-server && pnpm vitest run <file>     # Run a single test file
```

Build output: `app-extension/.output/chrome-mv3/` — load unpacked in `chrome://extensions/`.

## Code Style (Biome)

- 2-space indentation, 100-char line width
- Double quotes, trailing commas, always semicolons
- `noNonNullAssertion` is disabled (non-null assertions `!` are allowed)
- Run `pnpm format` before committing

## Architecture

### Extension (`app-extension/`)

- **WXT** (v0.20) bundles the extension; entry points live in `src/entrypoints/`
- **Zustand** store in `src/stores/app-store.ts` is the single source of truth for workspaces, collections, tabs, and live browser tabs
- **Dexie** schema in `src/lib/db.ts` defines IndexedDB tables: Accounts, Workspaces, TabCollections, CollectionTabs, Settings, ImportSessions
- **Fractional indexing** for drag-and-drop ordering (via `fractional-indexing` package)
- **@dnd-kit** for drag-and-drop interactions
- **shadcn/ui** components in `src/components/ui/` (Radix UI primitives)
- **i18next** for internationalization; locale files in `src/locales/`
- Path alias: `@/` maps to `./src/`

### Server (`app-server/`)

- **Hono** HTTP framework on port 3001
- **better-auth** with anonymous + bearer plugins for authentication
- **better-sqlite3** for the auth database (`data/auth.db`)
- CORS configured via `TRUSTED_ORIGINS` and `TRUSTED_EXTENSION_ORIGINS` env vars

### Auth Flow

The extension works offline by default with a local UUID. When server sync is enabled: extension calls `/api/auth/sign-in/anonymous` → gets bearer token → stores in `chrome.storage` → uses for subsequent API calls.

## Key Patterns

- **Radix UI + Dialog**: When triggering a Dialog from a DropdownMenu, use `onCloseAutoFocus` with a ref to prevent focus from returning to the trigger — avoids `aria-hidden` warnings. Always include `DialogDescription` in `DialogContent`.
- **Chrome APIs**: The extension uses `chrome.storage`, `chrome.alarms`, `chrome.tabs`, and `chrome.downloads` permissions (declared in `wxt.config.ts`).
- **Offline-first**: All CRUD operations go through Dexie first. Server sync is a secondary layer.
- **Extension icons**: WXT auto-detects `public/icon/{16,32,48,96,128}.png` for the manifest `icons` field. When adding or changing visual assets (logo, favicon), always keep `public/icon/` and `public/favicon*` in sync.
