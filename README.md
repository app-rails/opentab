# OpenTab

A Chrome extension for managing browser tabs with workspaces and collections.

## Project Structure

```
apps/
  extension/       Chrome extension (WXT + React + Tailwind)
  server/          Backend server (Hono + tRPC + Drizzle)
  web/             Web management panel (React + TanStack Router)
packages/
  api/             tRPC router definitions
  auth/            better-auth configuration factory
  config/          Shared TypeScript configuration
  db/              Drizzle ORM schema and database client
  shared/          Shared types (AuthState, HealthResponse)
  ui/              shadcn/ui component library
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev                                    # Start all packages
pnpm --filter @opentab/extension dev        # Extension only
pnpm --filter @opentab/server dev           # Server only
pnpm --filter @opentab/web dev              # Web app only
```

### Build

```bash
pnpm build
```

Build output: `apps/extension/.output/chrome-mv3/`

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**, select `apps/extension/.output/chrome-mv3`

### Tests

```bash
cd apps/server && pnpm test
```

## Architecture

The extension runs **local-first** by default — no server required. All tab and workspace data is stored in IndexedDB (Dexie).

Server sync is opt-in: go to **Settings** (gear icon at bottom of sidebar) to enable it and configure the server URL.

### Extension Pages

| Page | Description |
|------|-------------|
| `tabs.html` | Main dashboard — workspaces, collections, live tabs |
| `settings.html` | Server sync configuration |
| `import.html` | Import from other tab managers |

### Tech Stack

- **Extension**: [WXT](https://wxt.dev), React 19, Tailwind v4, Zustand, Dexie (IndexedDB), @dnd-kit, i18next
- **Server**: Hono, tRPC, Drizzle ORM (SQLite/PostgreSQL), better-auth (anonymous + email/password + OAuth)
- **Web**: React 19, TanStack Router, TanStack Query, tRPC client
- **Shared Packages**: `@opentab/ui` (shadcn components), `@opentab/api` (tRPC), `@opentab/auth`, `@opentab/db`, `@opentab/config`
- **Tooling**: pnpm workspaces, Turborepo, Biome (lint + format), lefthook (git hooks)
