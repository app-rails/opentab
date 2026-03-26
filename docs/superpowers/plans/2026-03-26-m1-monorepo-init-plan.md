# M1 Monorepo Init — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a pnpm + Turborepo monorepo with a WXT Chrome extension (React + Tailwind v4 + shadcn/ui), a Hono backend, and a shared types package — all startable via `pnpm dev`.

**Architecture:** Three workspace packages — `app-extension` (WXT Chrome extension), `app-server` (Hono API), `packages/shared` (TS types). Root orchestration via Turborepo v2. Shared package exports raw TypeScript consumed directly by Vite and tsx.

**Tech Stack:** pnpm workspaces, Turborepo v2, WXT 0.20+, React 19, Tailwind CSS v4, shadcn/ui, Hono, tsx

---

## File Structure

```
port-louis/
  .gitignore                          # Node, WXT, turbo ignores
  .nvmrc                              # Node 22
  package.json                        # root workspace, turbo scripts
  pnpm-workspace.yaml                 # app-* + packages/*
  turbo.json                          # v2 tasks format
  tsconfig.base.json                  # shared TS config
  app-extension/
    package.json                      # @opentab/extension
    wxt.config.ts                     # srcDir, React module, Tailwind vite plugin, @ alias
    tsconfig.json                     # extends base, jsx, paths
    components.json                   # shadcn/ui config
    src/
      assets/
        main.css                      # Tailwind v4 + shadcn theme variables
      lib/
        utils.ts                      # cn() helper
      components/
        ui/
          button.tsx                  # shadcn Button component
          card.tsx                    # shadcn Card component
      entrypoints/
        popup/
          index.html                  # WXT popup entry
          main.tsx                    # React mount for popup
          App.tsx                     # Popup UI with link to tabs page
        tabs/
          index.html                  # WXT unlisted page entry
          main.tsx                    # React mount for tabs page
          App.tsx                     # Full-page skeleton with Card + Button
        background.ts                 # Service worker: icon click → open/focus tabs
  app-server/
    package.json                      # @opentab/server
    tsconfig.json                     # extends base
    src/
      index.ts                        # Hono app with /api/health
  packages/
    shared/
      package.json                    # @opentab/shared, exports → src/index.ts
      tsconfig.json                   # extends base
      src/
        index.ts                      # re-export
        types.ts                      # HealthResponse interface
```

---

## Task 1: Root Monorepo Configuration

**Files:**
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/

# Build outputs
dist/
.output/
.turbo/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# WXT
.wxt/

# Context (conductor)
.context/
```

- [ ] **Step 2: Create `.nvmrc`**

```
22
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "opentab",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5"
  },
  "packageManager": "pnpm@10.8.0"
}
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "app-*"
  - "packages/*"
```

- [ ] **Step 5: Create `turbo.json`**

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".output/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 6: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 7: Install root dependencies**

Run:
```bash
pnpm install
```

Expected: `node_modules/` created, `pnpm-lock.yaml` generated, turbo and typescript installed.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .nvmrc package.json pnpm-workspace.yaml turbo.json tsconfig.base.json pnpm-lock.yaml
git commit -m "feat: init monorepo root with pnpm + turborepo v2"
```

---

## Task 2: Shared Types Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@opentab/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared/src/types.ts`**

```ts
export interface HealthResponse {
  status: "ok";
  timestamp: number;
}
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```ts
export type { HealthResponse } from "./types.js";
```

- [ ] **Step 5: Install shared dependencies**

Run:
```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updated.

- [ ] **Step 6: Verify TypeScript compiles**

Run:
```bash
pnpm --filter @opentab/shared lint
```

Expected: Exits 0 with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/ pnpm-lock.yaml
git commit -m "feat: add @opentab/shared with HealthResponse type"
```

---

## Task 3: Hono Backend

**Files:**
- Create: `app-server/package.json`
- Create: `app-server/tsconfig.json`
- Create: `app-server/src/index.ts`

- [ ] **Step 1: Create `app-server/package.json`**

```json
{
  "name": "@opentab/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^1",
    "@opentab/shared": "workspace:*",
    "hono": "^4"
  },
  "devDependencies": {
    "@types/node": "^22",
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `app-server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `app-server/src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { HealthResponse } from "@opentab/shared";

const app = new Hono();

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
  };
  return c.json(body);
});

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

- [ ] **Step 4: Install server dependencies**

Run:
```bash
pnpm install
```

Expected: hono, @hono/node-server, tsx installed. `pnpm-lock.yaml` updated.

- [ ] **Step 5: Verify server starts and responds**

Run:
```bash
cd app-server && pnpm dev &
sleep 2
curl -s http://localhost:3001/api/health
kill %1
cd ..
```

Expected: `{"status":"ok","timestamp":...}` returned.

- [ ] **Step 6: Verify TypeScript types**

Run:
```bash
pnpm --filter @opentab/server lint
```

Expected: Exits 0 with no errors.

- [ ] **Step 7: Commit**

```bash
git add app-server/ pnpm-lock.yaml
git commit -m "feat: add @opentab/server with Hono /api/health endpoint"
```

---

## Task 4: WXT Extension Scaffold (no UI yet)

**Files:**
- Create: `app-extension/package.json`
- Create: `app-extension/wxt.config.ts`
- Create: `app-extension/tsconfig.json`

- [ ] **Step 1: Create `app-extension/package.json`**

```json
{
  "name": "@opentab/extension",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@opentab/shared": "workspace:*",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@wxt-dev/module-react": "^1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "wxt": "^0.20"
  }
}
```

- [ ] **Step 2: Create `app-extension/wxt.config.ts`**

```ts
import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  }),
});
```

- [ ] **Step 3: Create `app-extension/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", ".wxt/wxt.d.ts"],
  "exclude": ["node_modules", ".output"]
}
```

- [ ] **Step 4: Install extension dependencies**

Run:
```bash
pnpm install
```

Expected: All deps installed. `pnpm-lock.yaml` updated.

- [ ] **Step 5: Commit**

```bash
git add app-extension/package.json app-extension/wxt.config.ts app-extension/tsconfig.json pnpm-lock.yaml
git commit -m "feat: scaffold @opentab/extension with WXT + React + Tailwind v4"
```

---

## Task 5: Tailwind v4 + shadcn/ui Integration

**Files:**
- Create: `app-extension/src/assets/main.css`
- Create: `app-extension/src/lib/utils.ts`
- Create: `app-extension/components.json`
- Create: `app-extension/src/components/ui/button.tsx` (via shadcn CLI)
- Create: `app-extension/src/components/ui/card.tsx` (via shadcn CLI)

- [ ] **Step 1: Initialize shadcn/ui**

Run from `app-extension/`:
```bash
cd app-extension && pnpm dlx shadcn@latest init -d
```

This will generate `components.json`, `src/lib/utils.ts`, and `src/assets/main.css` (or similar paths). The `-d` flag uses defaults.

If the CLI asks for template, select **Vite**.

- [ ] **Step 2: Verify and adjust `components.json`**

After CLI init, read the generated `components.json` and adjust if needed. The file should look like:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/assets/main.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Key adjustments to verify:
- `rsc: false` (not Next.js)
- `tailwind.css` points to `src/assets/main.css`
- `tailwind.config` is empty string (Tailwind v4, no JS config)
- All aliases use `@/` prefix

- [ ] **Step 3: Verify `src/assets/main.css`**

The CLI should generate this file with Tailwind v4 imports and shadcn theme variables. Verify it contains:
- `@import "tailwindcss";`
- `@theme inline { ... }` block with color/radius variables
- `:root { ... }` and `.dark { ... }` with oklch color tokens
- `@layer base { ... }` with body styles

If the CSS file is generated at a different path (e.g., `src/styles/globals.css`), move it to `src/assets/main.css` and update `components.json` accordingly.

- [ ] **Step 4: Verify `src/lib/utils.ts`**

Should contain the `cn()` helper:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

If not generated, create this file manually.

- [ ] **Step 5: Add Button component**

```bash
cd app-extension && pnpm dlx shadcn@latest add button
```

Expected: `src/components/ui/button.tsx` created.

- [ ] **Step 6: Add Card component**

```bash
cd app-extension && pnpm dlx shadcn@latest add card
```

Expected: `src/components/ui/card.tsx` created.

- [ ] **Step 7: Verify all shadcn deps were auto-installed**

Check that `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, and `lucide-react` are present in `app-extension/package.json`. If any are missing, install them:

```bash
pnpm --filter @opentab/extension add class-variance-authority clsx tailwind-merge tw-animate-css lucide-react
```

Note: these are runtime dependencies (imported by shadcn components at build time), so install without `-D`.

- [ ] **Step 8: Commit**

```bash
cd ..
git add app-extension/components.json app-extension/src/assets/ app-extension/src/lib/ app-extension/src/components/ app-extension/package.json pnpm-lock.yaml
git commit -m "feat: integrate Tailwind v4 + shadcn/ui with Button and Card"
```

---

## Task 6: WXT Entrypoints — Popup, Tabs Page, Background

**Files:**
- Create: `app-extension/src/entrypoints/popup/index.html`
- Create: `app-extension/src/entrypoints/popup/main.tsx`
- Create: `app-extension/src/entrypoints/popup/App.tsx`
- Create: `app-extension/src/entrypoints/tabs/index.html`
- Create: `app-extension/src/entrypoints/tabs/main.tsx`
- Create: `app-extension/src/entrypoints/tabs/App.tsx`
- Create: `app-extension/src/entrypoints/background.ts`

- [ ] **Step 1: Create `app-extension/src/entrypoints/popup/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenTab</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `app-extension/src/entrypoints/popup/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@/assets/main.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Create `app-extension/src/entrypoints/popup/App.tsx`**

```tsx
import { Button } from "@/components/ui/button";

export default function App() {
  const openTabsPage = () => {
    const url = browser.runtime.getURL("/tabs.html");
    browser.tabs.create({ url });
    window.close();
  };

  return (
    <div className="w-[320px] p-4">
      <h1 className="text-lg font-semibold mb-2">OpenTab</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Manage your tabs and workspaces
      </p>
      <Button onClick={openTabsPage} className="w-full">
        Open Dashboard
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create `app-extension/src/entrypoints/tabs/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenTab Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `app-extension/src/entrypoints/tabs/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@/assets/main.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 6: Create `app-extension/src/entrypoints/tabs/App.tsx`**

```tsx
import type { HealthResponse } from "@opentab/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <h1 className="text-3xl font-bold mb-8">OpenTab Dashboard</h1>
      <div className="grid grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Switch between contexts</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming in M3</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Managed Tabs</CardTitle>
            <CardDescription>Saved tab collections</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming in M3</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Live Tabs</CardTitle>
            <CardDescription>Currently open tabs</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming in M3</p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8">
        <Button variant="outline">
          Tailwind + shadcn/ui working!
        </Button>
      </div>
    </div>
  );
}
```

Note: The `HealthResponse` import validates that `@opentab/shared` types resolve correctly in the extension context.

- [ ] **Step 7: Create `app-extension/src/entrypoints/background.ts`**

```ts
export default defineBackground(() => {
  console.log("OpenTab background service worker started");
});
```

The background is minimal for now — just the service worker entry point. M3 will add icon-click → open/focus tabs page logic here (when popup is removed in favor of direct navigation).

- [ ] **Step 8: Commit**

```bash
git add app-extension/src/entrypoints/
git commit -m "feat: add popup, tabs page, and background entrypoints"
```

---

## Task 7: End-to-End Verification

- [ ] **Step 1: Run `pnpm dev` from root**

```bash
pnpm dev
```

Expected: Turborepo starts both `@opentab/extension` (WXT dev server) and `@opentab/server` (Hono on port 3001) concurrently. WXT generates `.output/chrome-mv3/` in `app-extension/`.

- [ ] **Step 2: Verify Hono health endpoint**

In a separate terminal:
```bash
curl -s http://localhost:3001/api/health | jq .
```

Expected:
```json
{
  "status": "ok",
  "timestamp": 1711468800000
}
```

- [ ] **Step 3: Verify extension loads in Chrome**

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `app-extension/.output/chrome-mv3`
5. Extension should appear with "OpenTab" name

- [ ] **Step 4: Verify popup works**

1. Click the extension icon in the toolbar
2. Popup shows "OpenTab" heading and "Open Dashboard" button
3. Click "Open Dashboard"
4. New tab opens with `chrome-extension://<id>/tabs.html`

- [ ] **Step 5: Verify tabs page renders shadcn components**

The tabs page should show:
- "OpenTab Dashboard" heading
- Three Card components in a 3-column grid (Workspaces, Managed Tabs, Live Tabs)
- A "Tailwind + shadcn/ui working!" outline button
- Proper styling (rounded cards, muted text colors, spacing)

- [ ] **Step 6: Verify TypeScript is clean**

```bash
pnpm lint
```

Expected: All three packages pass with 0 errors.

- [ ] **Step 7: Stop dev servers, then build**

Stop the `pnpm dev` process, then:
```bash
pnpm build
```

Expected: All packages build successfully. `app-extension/.output/chrome-mv3` contains the production build. `app-server/dist/` contains compiled JS. `packages/shared/dist/` contains compiled types.

- [ ] **Step 8: Final commit**

If any adjustments were needed during verification:
```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification"
```

If no changes needed, skip this step.

---

## Acceptance Criteria Checklist

| # | Criterion | Verified in |
|---|-----------|-------------|
| 1 | `pnpm dev` starts WXT + Hono concurrently | Task 7, Step 1 |
| 2 | `curl localhost:3001/api/health` returns JSON | Task 7, Step 2 |
| 3 | Extension loads in Chrome dev mode | Task 7, Step 3 |
| 4 | Popup → "Open Dashboard" → tabs page | Task 7, Step 4 |
| 5 | Tabs page renders shadcn Card + Button | Task 7, Step 5 |
| 6 | `@opentab/shared` types import in both packages | Task 7, Step 6 |
