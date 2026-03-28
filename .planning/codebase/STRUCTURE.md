# Codebase Structure

**Analysis Date:** 2026-03-28

## Directory Layout

```
opentab/
├── app-extension/          # Chrome extension (React + Zustand + Dexie)
│   ├── src/
│   │   ├── entrypoints/    # Extension entry points (background, popup, tabs)
│   │   ├── stores/         # Zustand state management
│   │   ├── components/     # React UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities, DB, auth, API
│   │   └── assets/         # CSS, images
│   ├── wxt.config.ts       # WXT extension build config
│   └── package.json
│
├── app-server/             # Hono API server (Node.js)
│   ├── src/
│   │   ├── index.ts        # Server entry point
│   │   ├── app.ts          # Hono app & routes
│   │   ├── auth.ts         # better-auth setup
│   │   ├── env.ts          # Environment variables
│   │   └── __tests__/      # Vitest tests
│   ├── data/               # SQLite database files
│   ├── vitest.config.ts    # Test config
│   └── package.json
│
├── packages/shared/        # Shared TypeScript types
│   ├── src/
│   │   ├── index.ts        # Re-exports
│   │   └── types.ts        # AuthState, HealthResponse
│   └── package.json
│
├── .planning/codebase/     # Generated architecture docs
├── docs/                   # Project documentation
├── biome.json              # Code formatter/linter config
├── tsconfig.base.json      # Root TypeScript config
├── turbo.json              # Turbo monorepo config
├── pnpm-workspace.yaml     # pnpm workspace definition
└── package.json            # Root workspace manifest
```

## Directory Purposes

**app-extension/src/entrypoints/:**
- Purpose: WXT-managed extension entry points (compile to separate bundles)
- Contains: `background.ts` (service worker), `popup/` (popup UI), `tabs/` (dashboard)
- Key files:
  - `background.ts` - listens to Chrome events, syncs auth, broadcasts tab changes
  - `popup/main.tsx`, `popup/App.tsx` - simple "Open Dashboard" interface
  - `tabs/main.tsx`, `tabs/App.tsx` - main dashboard with 3-panel layout, DnD context

**app-extension/src/stores/:**
- Purpose: Centralized state management
- Contains: `app-store.ts` (Zustand store with all CRUD logic)
- Pattern: Single store file with workspace/collection/tab mutations

**app-extension/src/components/:**
- Purpose: React component library organized by domain
- Contains:
  - `ui/` - Reusable primitives (button, dialog, input, card, etc. from shadcn)
  - `layout/` - Page-level panels (WorkspaceSidebar, CollectionPanel, LiveTabPanel)
  - `workspace/` - Workspace CRUD (create/delete dialogs, icon picker, item rendering)
  - `collection/` - Collection & tab management (cards, items, add-inline, dialogs)
  - `live-tabs/` - Live tab rendering and sync
  - `tab-favicon.tsx` - Shared favicon renderer

**app-extension/src/hooks/:**
- Purpose: Custom React hooks for extension-specific logic
- Contains: `use-live-tab-sync.ts` - listens to background worker messages, syncs live tabs

**app-extension/src/lib/:**
- Purpose: Non-UI utilities and integrations
- Contains:
  - `db.ts` - Dexie schema definitions (Account, Workspace, TabCollection, CollectionTab, Setting)
  - `db-init.ts` - Seed function for default workspace/collection (idempotent)
  - `auth-manager.ts` - Anonymous auth flow with offline fallback
  - `auth-storage.ts` - Wrapper for `browser.storage.local`
  - `api.ts` - Fetch client for server endpoints (signInAnonymous, checkHealth)
  - `dnd-types.ts` - Type-safe drag metadata discriminated union
  - `constants.ts` - Workspace icons, message types, max lengths
  - `utils.ts` - Helpers: classname merging, order comparison, camelCase conversion, fractional ordering

**app-server/src/:**
- Purpose: Minimal Hono API server
- Contains:
  - `index.ts` - Server startup (port 3001)
  - `app.ts` - Route definitions, CORS middleware
  - `auth.ts` - better-auth instance with anonymous + bearer plugins
  - `env.ts` - Environment variable access with validation
  - `__tests__/` - Vitest tests for auth

**packages/shared/src/:**
- Purpose: Type definitions shared between client and server
- Contains:
  - `types.ts` - `AuthState` (online/offline variants), `HealthResponse`
  - `index.ts` - Re-exports for clean imports

**app-extension/src/assets/:**
- Purpose: Static CSS and images
- Contains: `main.css` (Tailwind imports)

## Key File Locations

**Entry Points:**
- Background worker: `app-extension/src/entrypoints/background.ts`
- Popup: `app-extension/src/entrypoints/popup/App.tsx`
- Tabs dashboard: `app-extension/src/entrypoints/tabs/App.tsx`
- Server: `app-server/src/index.ts`

**Configuration:**
- Extension build: `app-extension/wxt.config.ts` (WXT framework config, Tailwind integration)
- Server environment: `app-server/src/env.ts` (required vars: BETTER_AUTH_SECRET)
- Type checking: `tsconfig.base.json`, `app-extension/tsconfig.json`, `app-server/tsconfig.json`
- Code quality: `biome.json` (Biome formatter + linter)
- Build orchestration: `turbo.json` (task dependencies for pnpm workspaces)

**Core Logic:**
- State management: `app-extension/src/stores/app-store.ts` (all workspace/collection/tab CRUD)
- Data persistence: `app-extension/src/lib/db.ts` (Dexie schema + migrations)
- Authentication: `app-extension/src/lib/auth-manager.ts` (online/offline flow)
- API client: `app-extension/src/lib/api.ts` (fetch wrapper for server)
- Server routes: `app-server/src/app.ts` (Hono routes)
- Server auth: `app-server/src/auth.ts` (better-auth setup)

**Testing:**
- Extension tests: `app-extension/` (no test files currently, vitest configured but empty)
- Server tests: `app-server/src/__tests__/` (vitest tests for auth endpoints)
- Vitest config: `app-server/vitest.config.ts`

## Naming Conventions

**Files:**
- Components: `PascalCase.tsx` (e.g., `CollectionCard.tsx`, `WorkspaceSidebar.tsx`)
- Hooks: `use[Name].ts` (e.g., `use-live-tab-sync.ts`)
- Utilities: `kebab-case.ts` (e.g., `auth-manager.ts`, `dnd-types.ts`)
- Tests: `[Name].test.ts` or `[Name].spec.ts`
- Types/exports-only files: lowercase-with-dashes (e.g., `auth-storage.ts`, `constants.ts`)

**Directories:**
- Feature areas: plural/descriptive nouns (e.g., `components`, `stores`, `entrypoints`, `__tests__`)
- UI hierarchy: domain-based (e.g., `workspace/`, `collection/`, `live-tabs/`, `layout/`, `ui/`)

**Functions:**
- camelCase (e.g., `handleDragStart`, `addTabToCollection`, `seedDefaultData`)
- Hooks use `use` prefix (e.g., `useLiveTabSync`, `useAppStore`)
- Utility functions are generic/descriptive (e.g., `generateKeyBetween`, `computeOrderBetween`)

**Variables:**
- camelCase (e.g., `activeWorkspaceId`, `liveTabs`, `tabsByCollection`)
- Constants: SCREAMING_SNAKE_CASE (e.g., `WORKSPACE_ICON_OPTIONS`, `DEFAULT_ICON`, `MSG`)
- React components/hooks: PascalCase (e.g., `WorkspaceSidebar`, `useLiveTabSync`)

**Types:**
- PascalCase interfaces/types (e.g., `Workspace`, `TabCollection`, `CollectionTab`)
- Discriminated unions: `Type1 | Type2 | Type3` (e.g., `AuthState`, `DragData`)
- Props: `[ComponentName]Props` (e.g., `CollectionCardProps`)

## Where to Add New Code

**New Feature (Workspace/Collection/Tab mutation):**
- Primary logic: Add method to `useAppStore` in `app-extension/src/stores/app-store.ts`
- Database schema: Update/add table in `app-extension/src/lib/db.ts` with migration if needed
- Tests: Add to `app-server/src/__tests__/` if backend-dependent

**New UI Component:**
- Domain component: `app-extension/src/components/[domain]/[ComponentName].tsx`
- Generic/reusable: `app-extension/src/components/ui/[component-name].tsx`
- Page layout: `app-extension/src/components/layout/[LayoutName].tsx`
- Connect to store: Import `useAppStore` for state access

**New Hook:**
- Location: `app-extension/src/hooks/[use-hook-name].ts`
- Pattern: Export named function starting with `use`, use Zustand/Chrome APIs inside

**New Utility:**
- Location: `app-extension/src/lib/[utility-name].ts`
- Pattern: Pure functions, no React, no component dependencies

**New Server Endpoint:**
- Route definition: Add handler in `app-server/src/app.ts` (e.g., `app.post("/api/path", handler)`)
- Auth logic: Update `app-server/src/auth.ts` if auth plugin configuration needed
- Shared types: Export response/request types from `packages/shared/src/types.ts`
- Environment: Add required vars to `app-server/src/env.ts` and `.env.example`

**New Database Migration:**
- Schema change: Update `app-extension/src/lib/db.ts` in `db.version(N)` block
- Migration logic: Add `.upgrade()` callback for data transformation (idempotent)
- Seeds: Update `app-extension/src/lib/db-init.ts` if new default entities needed

## Special Directories

**app-extension/src/assets/:**
- Purpose: Static assets
- Generated: No
- Committed: Yes (CSS, images)
- Imports: Referenced from entrypoints as `import "@/assets/main.css"`

**app-server/data/:**
- Purpose: SQLite database files (created by better-auth)
- Generated: Yes (created at runtime by better-auth)
- Committed: No (should be in .gitignore)
- Location: `./data/auth.db` created by server at startup

**app-extension/.output/:**
- Purpose: Compiled extension output (generated by WXT build)
- Generated: Yes
- Committed: No (in .gitignore)
- Build command: `npm run build` (runs `wxt build`)

**packages/shared/src/ (no output, TS types only):**
- Purpose: Type definitions consumed by extension and server
- Generated: No
- Committed: Yes (source-only package)
- Build: TypeScript compile-to-check only (`npm run build` runs `tsc`)

---

*Structure analysis: 2026-03-28*
