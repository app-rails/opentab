# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**与 ETHOS.md 的关系：** 这份文档是行为规则（"做什么 / 不做什么"），背后的信念基础在 `ETHOS.md`（"为什么这样"）。两者冲突时以这份 CLAUDE.md 为准——具体规则永远高于抽象信念。

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 0. Communication RULES

- Speak like a HUMAN, When communicating, avoid using jargon and omitting a lot of context.
- Avoid mixing Chinese and English.
- Always communicate in Chinese, Code and comments must be in English.
- For SPECs, PLANS, and technical documentation, use Chinese as much as possible, except for technical terms and key code variables/functions.
- The direction selection sequence needs to be a number, it can be 1|2|3..., or 1.1 | 1.2 |1.3 ...

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. 完整胜出 + Simplicity First

**Narrow the scope. Deepen everything inside it.**

Two dimensions, never in conflict — scope (what to build) and depth (how thoroughly). 与 `ETHOS.md` 原则 1（完整胜出 / Boil the Lake）和原则 2（边界要小 / Simplicity First）一一对应。

**Scope control — prefer less** (*what* to build):
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.

**Depth control — prefer complete** (*how thoroughly* to do what's in scope):
- Within scope: happy path, edge cases, error paths, tests — all of it.
- "Defer tests to next PR" → no. Tests are the cheapest lake to boil.
- Complete (~150 lines) vs shortcut (~80 lines, 90% coverage) → pick complete.
- Ocean-level work (full rewrite, multi-quarter migration) → flag as out of scope, do not start.

**The "200 → 50" test:**
- Same scope, just less verbose? Trim it.
- Loses completeness to fit smaller? Reject — that's偷工, not简化.

Ask two questions:
1. Would a senior engineer say this **scope** is too large? → If yes, narrow.
2. Would they say this **depth** is incomplete? → If yes, deepen.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---


---

<!-- 以下为项目原有内容，由 /my-setup-agent 合并保留 -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenTab is a Chrome extension for managing browser tabs with workspaces and collections. It runs **local-first** (IndexedDB via Dexie) with optional server sync (Hono + better-auth).

**Monorepo layout**: `apps/extension/` (Chrome extension), `apps/server/` (backend), `apps/web/` (management panel), `packages/` (shared libraries: config, db, auth, api, ui, shared).

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
cd apps/server && pnpm test                 # Run all vitest tests
cd apps/server && pnpm vitest run <file>    # Run a single test file
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

### Server (`apps/server/`)

- **Hono** HTTP framework on port 3001
- **better-auth** via `@opentab/auth` package (anonymous + bearer + email/password + OAuth)
- **Drizzle ORM** via `@opentab/db` package (SQLite default, optional PostgreSQL)
- **tRPC** via `@opentab/api` package (type-safe API layer)
- CORS configured via `TRUSTED_ORIGINS` and `TRUSTED_EXTENSION_ORIGINS` env vars
- Environment validation via `@t3-oss/env-core` + Zod

### Auth Flow

The extension works offline by default with a local UUID. When server sync is enabled: extension calls `/api/auth/sign-in/anonymous` → gets bearer token → stores it in `browser.storage.local` under the `opentab_auth` key → uses it for subsequent API calls.

## Key Patterns

- **Radix UI + Dialog**: When triggering a Dialog from a DropdownMenu, use `onCloseAutoFocus` with a ref to prevent focus from returning to the trigger — avoids `aria-hidden` warnings. Always include `DialogDescription` in `DialogContent`.
- **Chrome APIs**: The extension uses `chrome.storage`, `chrome.alarms`, `chrome.tabs`, and `chrome.downloads` permissions (declared in `wxt.config.ts`).
- **Offline-first**: All CRUD operations go through Dexie first. Server sync is a secondary layer.
- **Extension icons**: WXT auto-detects `public/icon/{16,32,48,96,128}.png` for the manifest `icons` field. When adding or changing visual assets (logo, favicon), always keep `public/icon/` and `public/favicon*` in sync.
