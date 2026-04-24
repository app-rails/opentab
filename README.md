# OpenTab

A Chrome extension for managing browser tabs with workspaces and collections.

## Project Structure

```
apps/
  extension/       Chrome extension (WXT + React + Tailwind)
packages/
  config/          Shared TypeScript configuration
  protocol/        Wire protocol types (coming Phase 1)
  shared/          Shared types and utilities
  ui/              shadcn/ui component library
```

**Phase 1 (in progress)**: `apps/cloud` — React Router v7 + Cloudflare Workers + D1 + KV. Deployment is managed by Alchemy IaC.

See:
- [Product design](docs/superpowers/specs/2026-04-24-apps-cloud-design.md)
- [Deployment design (Alchemy IaC)](docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md)
- [Phase 1 plan](docs/superpowers/plans/2026-04-24-apps-cloud.md)

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


## Architecture

The extension runs **local-first** — all tab and workspace data is stored in IndexedDB (Dexie). Server sync is temporarily disabled in Phase 0 and will be restored in Phase 1.

### Extension Pages

| Page | Description |
|------|-------------|
| `tabs.html` | Main dashboard — workspaces, collections, live tabs |
| `settings.html` | Extension preferences |
| `import.html` | Import from other tab managers |

### Tech Stack

- **Extension**: [WXT](https://wxt.dev), React 19, Tailwind v4, Zustand, Dexie (IndexedDB), @dnd-kit, i18next
- **Shared Packages**: `@opentab/ui` (shadcn components), `@opentab/config`, `@opentab/protocol`, `@opentab/shared`
- **Tooling**: pnpm workspaces, Turborepo, Biome (lint + format), lefthook (git hooks)
