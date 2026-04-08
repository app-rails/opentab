# CI/CD Pipeline Design

## Overview

Set up GitHub Actions for CI (lint/type-check on push to main) and CD (build + release on tag push), with build info visible in the extension's Settings > General page.

## CI: `.github/workflows/ci.yml`

- **Trigger**: push to `main`
- **Steps**: checkout → setup pnpm@10.8.0 + Node 22 → `pnpm install` → `pnpm lint`
- `pnpm lint` runs `tsc --noEmit && biome check .` in both `app-extension` and `app-server` via turbo

## CD: `.github/workflows/release.yml`

- **Trigger**: push tag matching `v*`
- **Steps**:
  1. Checkout → setup pnpm@10.8.0 + Node 22 → `pnpm install`
  2. Extract version from tag (e.g. `v0.1.0` → `0.1.0`), write to `app-extension/package.json` version field (WXT syncs this to manifest.json automatically)
  3. Set env vars: `BUILD_VERSION`, `BUILD_COMMIT` (short hash), `BUILD_TIME` (YYYY-MM-DD)
  4. `pnpm build` (turbo builds all packages)
  5. Zip `app-extension/.output/chrome-mv3/` → `opentab-chrome-extension-v{version}.zip`
  6. Create GitHub Release via `softprops/action-gh-release`, upload zip, auto-generate changelog with `--generate-notes`

## Build Info Injection

- In `wxt.config.ts`, use Vite `define` to inject global constants:
  - `__BUILD_VERSION__` — from env `BUILD_VERSION` or `package.json` version, fallback `"dev"`
  - `__BUILD_COMMIT__` — from env `BUILD_COMMIT`, fallback `"dev"`
  - `__BUILD_TIME__` — from env `BUILD_TIME`, fallback current date
- New file `app-extension/src/lib/build-info.ts` exports typed accessors for these constants
- Type declarations in `app-extension/src/env.d.ts`

## Settings Page: Version & Build Info

- Add an "About" section at the bottom of the General tab in `app-extension/src/entrypoints/settings/App.tsx`
- Display format: `v0.1.0 (abc1234) · 2026-04-08`
- Copy button next to it — copies full build string to clipboard for user feedback
- Add i18n keys to both `en.json` and `zh.json`:
  - `settings.about.title` — "About" / "关于"
  - `settings.about.version` — "Version" / "版本"
  - `settings.about.copied` — "Copied!" / "已复制！"

## Files to Create/Modify

**Create:**
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `app-extension/src/lib/build-info.ts`
- `app-extension/src/env.d.ts`

**Modify:**
- `app-extension/wxt.config.ts` — add Vite `define` for build constants
- `app-extension/src/entrypoints/settings/App.tsx` — add About section
- `app-extension/src/locales/en.json` — add settings.about keys
- `app-extension/src/locales/zh.json` — add settings.about keys
