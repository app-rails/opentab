# Changelog

All notable changes to OpenTab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-04-11

Initial release of OpenTab — a local-first Chrome extension for managing browser
tabs with workspaces and collections.

### Features

- **Workspaces** — create, switch, rename, and delete multiple workspaces to
  separate tab contexts (work, research, personal, etc.)
- **Tab collections** — save the current window's tabs as a named collection,
  reopen the whole group in a new window with one click
- **Drag-and-drop ordering** — reorder collections and tabs with fractional
  indexing via @dnd-kit
- **Live tabs view** — real-time panel showing currently open browser tabs
  alongside saved collections
- **Import / export** — move collection data between devices or back it up
- **Local-first storage** — all data lives in IndexedDB (Dexie); works fully
  offline with no account required
- **Optional server sync** — self-hostable Hono + better-auth backend with
  anonymous sign-in and bearer tokens for multi-device sync
- **Internationalization** — English and Simplified Chinese
- **Management panel** — standalone `apps/web` interface for browsing and
  managing synced data outside the extension

### Tech stack

- **Extension**: WXT 0.20, React, Zustand, Dexie, @dnd-kit, shadcn/ui, i18next
- **Server**: Hono, better-auth, Drizzle ORM (SQLite / PostgreSQL), tRPC
- **Monorepo**: pnpm workspaces, Turborepo, Biome

### Installation

Download `opentab-chrome-extension-v0.0.1.zip` from the GitHub release, unzip,
then load the `chrome-mv3` folder via `chrome://extensions/` → Developer mode →
"Load unpacked".

[0.0.1]: https://github.com/app-rails/opentab/releases/tag/v0.0.1
