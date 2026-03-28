# OpenTab

## What This Is

A Chrome Extension for workflow-based tab management. Users organize tabs into Workspaces > Collections > Tabs — a three-level hierarchy that lets them save, manage, and instantly open groups of related tabs to switch into any work context with one click. The main interface is a new tab page, with a popup that redirects to it.

## Core Value

One-click context switching: open a collection and instantly have all the tabs you need for that workflow.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Collection CRUD — create, rename, delete collections — existing
- ✓ Live tabs panel — real-time view of currently open browser tabs — existing
- ✓ Cross-panel drag & drop — drag live tabs into collections, reorder tabs and collections — existing
- ✓ Save live tabs to collection — save current browser tabs as a new collection — existing
- ✓ Tab management within collections — add, remove, reorder tabs — existing
- ✓ Zustand + Dexie local-first persistence — data stored in IndexedDB — existing
- ✓ Background service worker — syncs live tab state via Chrome APIs — existing
- ✓ Anonymous auth with optional server sync — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Workspace layer — create, switch, rename, delete workspaces; collections belong to a workspace
- [ ] Open collection — click a collection to open all its tabs in a new Chrome window
- [ ] Chrome Web Store readiness — manifest, icons, descriptions, permissions audit
- [ ] Popup → new tab page redirect — clicking extension icon opens the full management page

### Out of Scope

- Cloud sync across devices — local-first for now, defer to future
- Tab session restore (remembering window positions/sizes) — too complex for v1
- Keyboard shortcuts / command palette — nice-to-have, not core
- Tab grouping (Chrome tab groups API) — separate from collection concept
- Collaborative workspaces / sharing — personal tool first

## Context

- Brownfield project with working collection + live tabs UI, cross-panel DnD, and local persistence already built
- Monorepo: `app-extension/` (WXT + React 19), `app-server/` (Hono), `packages/shared/`
- Stack: TypeScript, pnpm + Turbo, Tailwind CSS 4, shadcn/Radix, Zustand, Dexie, dnd-kit, WXT
- Data model uses fractional indexing for stable ordering
- Target: Chrome/Chromium browsers

## Constraints

- **Platform**: Chrome Extension (Manifest V3, WXT framework)
- **Storage**: chrome.storage.local / Dexie IndexedDB — no cloud dependency for v1
- **Distribution**: Chrome Web Store — must pass review requirements
- **Architecture**: Must preserve existing local-first, offline-capable design

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three-level hierarchy (Workspace > Collection > Tabs) | Matches mental model of work contexts containing related tab groups | — Pending |
| New tab page as primary UI | More space than popup, becomes the daily landing page | — Pending |
| Open collection → new window | Clean separation between work contexts | — Pending |
| Local-first storage | Simpler v1, no server dependency for core features | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 after initialization*
