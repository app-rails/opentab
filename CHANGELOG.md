# Changelog

All notable changes to OpenTab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-05-13

Maintenance release. No user-facing changes — all CI/build/dependency work
under the hood to keep the project on supported runtimes before GitHub's
Node 20 deprecation on 2026-06-02.

### Changed

- **Dependencies refreshed** — 19 production deps and 16 development deps
  bumped, including TypeScript 6, Vite 8, `@vitejs/plugin-react` 6,
  `@types/node` 25, vitest 4.1.6, and wxt 0.20.26.
- **GitHub Actions on Node 24** — `actions/checkout`, `actions/setup-node`,
  `pnpm/action-setup`, and `softprops/action-gh-release` all bumped to their
  current majors.
- **Release notes** are now scoped to commits since the previous tag (no
  more replaying the full repo history on every release page).

### Fixed

- `apps/{web,extension}/tsconfig.json`: dropped the deprecated `baseUrl`
  option so the build keeps working on TypeScript 6+ (TS 7 removes it).

## [0.0.2] - 2026-05-13

### Added

- **Server sync engine (opt-in)** — outbox + change-log architecture wires the
  better-auth backend up end-to-end for reliable multi-device sync; still
  fully optional, local-first stays the default.
- **Theme toggler with ripple animation** — animated light/dark/system switcher
  in the sidebar.
- **Sort & dedupe tabs in a collection** — sort by title, URL, or date and
  remove duplicates with one click.
- **Move collections across workspaces** — drag a collection onto another
  workspace, with an optional "switch + focus" follow-up.
- **Export/import buttons in the sidebar** — back up or restore collection data
  without digging through menus.
- **Optional "close tabs after saving as collection"** — declutter the window
  in one step.

### Changed

- New workspaces and collections are inserted at the top of the list for
  faster access.
- Active workspace now syncs across all open OpenTab pages in real time.
- Import/export icons swapped to match directional intuition.

### Fixed

- Hardened save-tabs hydration and workspace-switch race conditions.
- Open OpenTab pages refresh after a backup import.
- Dexie `versionchange` events no longer leave the extension in a broken state
  after schema upgrades.

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

[0.0.3]: https://github.com/app-rails/opentab/releases/tag/v0.0.3
[0.0.2]: https://github.com/app-rails/opentab/releases/tag/v0.0.2
[0.0.1]: https://github.com/app-rails/opentab/releases/tag/v0.0.1
