# Technology Stack

**Analysis Date:** 2026-03-28

## Languages

**Primary:**
- TypeScript 5 - All application code across extension and server
- JavaScript (ESM) - Module format for all packages

**Secondary:**
- HTML/CSS - UI markup and styling in extension

## Runtime

**Environment:**
- Node.js 22 (specified in `.nvmrc`)

**Package Manager:**
- pnpm 10.8.0
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Hono 4 - Backend web framework for server at `app-server/src/app.ts`
- React 19 - Frontend UI library for browser extension

**Extensions & Tooling:**
- WXT 0.20 - Browser extension framework for `app-extension/`
- @wxt-dev/module-react 1 - React integration for WXT

**Styling:**
- Tailwind CSS 4 - Utility-first CSS framework
- @tailwindcss/vite 4 - Vite plugin for Tailwind CSS

**UI Components:**
- Radix UI 1.4.3 - Headless component primitives
- shadcn 4.1.0 - Component library built on Radix UI
- Lucide React 1.7.0 - Icon library

**State Management:**
- Zustand 5.0.12 - Lightweight state management library at `app-extension/src/stores/app-store.ts`
- Dexie 4.3.0 - IndexedDB wrapper for client-side data storage

**Drag & Drop:**
- @dnd-kit/core 6.3.1 - Drag and drop library
- @dnd-kit/sortable 10.0.0 - Sortable preset for dnd-kit
- @dnd-kit/utilities 3.2.2 - Utility functions for dnd-kit
- fractional-indexing 3.2.0 - Fractional indexing for stable reordering

**Testing:**
- Vitest 4.1.1 - Unit testing framework at `app-server/vitest.config.ts`

**Build & Dev Tools:**
- Turbo 2 - Monorepo build orchestration at `turbo.json`
- Biomejs 2.4.9 - Linting and formatting
- tsx 4 - TypeScript execution for Node.js

## Key Dependencies

**Critical:**
- better-auth 1.5.6 - Authentication framework with SQLite support
  - SDK: `better-sqlite3` 12.8.0
  - CLI: @better-auth/cli 1.4.21
  - Why: Handles user authentication, session management, and database migrations

**Infrastructure:**
- @hono/node-server 1 - Hono adapter for Node.js HTTP server
- better-sqlite3 12.8.0 - SQLite database client for auth data
- class-variance-authority 0.7.1 - Component variant library
- clsx 2.1.1 - Conditional classname utility
- tailwind-merge 3.5.0 - Merges Tailwind CSS classes
- tw-animate-css 1.4.0 - Animation utilities for Tailwind

## Configuration

**Environment:**
- Environment variables via `.env` files (not committed)
- Runtime validation in `app-server/src/env.ts`:
  - `BETTER_AUTH_SECRET` (required) - Auth encryption key
  - `BETTER_AUTH_URL` (optional, defaults to `http://localhost:3001`) - Auth service URL
  - `TRUSTED_ORIGINS` (optional, comma-separated) - CORS origins for server endpoints
  - `TRUSTED_EXTENSION_ORIGINS` (optional, comma-separated) - CORS origins for extension
  - `VITE_API_BASE` (optional in extension, defaults to `http://localhost:3001`) - Backend API endpoint

**Build:**
- TypeScript configuration: `tsconfig.base.json` (root), `tsconfig.json` in each app
- Biome configuration: `biome.json` - Formatting, linting, and code style
  - Format: 2-space indentation, 100-character line width
  - Quotes: Double quotes, trailing commas, always semicolons
  - Linter: Recommended rules enabled, non-null assertions disabled

**Extension Build:**
- WXT configuration: `app-extension/wxt.config.ts`
- Tailwind CSS Vite plugin integration
- Path alias: `@/` maps to `./src/`

**Server Build:**
- TypeScript output directory: `dist/`
- No declaration files in output
- Source maps enabled

## Platform Requirements

**Development:**
- Node.js 22 or compatible
- pnpm 10.8.0 or compatible
- Standard POSIX shell (scripts use sh/bash)

**Extension:**
- Chrome/Chromium-based browser with Web Extensions API support
- Requires browser permissions: `storage`, `alarms`, `tabs` (declared in `wxt.config.ts`)

**Production:**
- Node.js 22+ runtime for server deployment
- SQLite database file storage (default: `app-server/data/auth.db`)
- HTTPS endpoint for browser extension communication (configured via `BETTER_AUTH_URL`)

---

*Stack analysis: 2026-03-28*
