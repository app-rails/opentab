# OpenTab

A Chrome extension for managing browser tabs with workspaces and collections.

## Project Structure

```
app-extension/   Chrome extension (WXT + React + Tailwind + shadcn)
app-server/      Backend server (Hono + better-auth + SQLite)
packages/shared/ Shared types and utilities
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
```

### Build

```bash
pnpm build
```

Build output: `app-extension/.output/chrome-mv3/`

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**, select `app-extension/.output/chrome-mv3`

## Architecture

The extension runs **local-first** by default — no server required. All tab and workspace data is stored in IndexedDB (Dexie).

Server sync is opt-in: go to **Settings** (gear icon at bottom of sidebar) to enable it and configure the server URL.

### Extension Pages

| Page | Description |
|------|-------------|
| `tabs.html` | Main dashboard — workspaces, collections, live tabs |
| `settings.html` | Server sync configuration |
| `popup.html` | Browser action popup |

### Tech Stack

- **Extension**: [WXT](https://wxt.dev), React 19, Tailwind v4, shadcn/ui, Dexie (IndexedDB), Zustand
- **Server**: Hono, better-auth, better-sqlite3
- **Shared**: TypeScript types (AuthState, HealthResponse)
- **Tooling**: pnpm workspaces, Turborepo, Biome (lint + format)
