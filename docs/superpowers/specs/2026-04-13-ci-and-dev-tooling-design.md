# CI & Dev Tooling Setup

## Overview

Add GitHub CI, Dependabot, Claude Code shared settings, lefthook v2 hooks, and conventional commit enforcement to the OpenTab monorepo.

## 1. GitHub CI Workflow

**File:** `.github/workflows/ci.yml` (replace existing)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: Lint & Type Check
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "pnpm"

      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm check-types
```

**Changes from current:**
- Add `pull_request` trigger
- Add concurrency group (cancels in-progress runs on same ref)
- Use `--frozen-lockfile` instead of bare `pnpm install`
- Keep `pnpm lint` (runs `turbo lint` → per-package biome check with caching) and add explicit `pnpm check-types` step

## 2. Dependabot

**File:** `.github/dependabot.yml` (new)

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      production-dependencies:
        dependency-type: "production"
      development-dependencies:
        dependency-type: "development"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

## 3. Claude Code Settings

### Shared settings: `.claude/settings.json` (new, committed)

Team baseline permissions:

```json
{
  "permissions": {
    "allow": [
      "Bash(date:*)",
      "Bash(echo:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(wc:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(sort:*)",
      "Bash(grep:*)",
      "Bash(tr:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status:*)",
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git tag:*)"
    ],
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

### Local settings: `.claude/settings.local.json` (existing, trim)

Remove entries now covered by the shared file. Keep only extras:

```json
{
  "permissions": {
    "allow": [
      "Skill(gsd:map-codebase)",
      "Bash(wc -l .planning/codebase/*.md)",
      "Bash(grep -E '...' .planning/codebase/*.md)",
      "Bash(pnpm lint:*)",
      "Bash(gh release:*)",
      "Bash(gh run:*)",
      "Bash(gh pr:*)",
      "Bash(git push:*)",
      "Bash(git fetch:*)"
    ]
  }
}
```

Note: deny rules are inherited from the shared file and don't need repeating.

## 4. Lefthook

**File:** `lefthook.yml` (replace existing)

Migrate from `commands` format to v2 `jobs` format:

```yaml
pre-commit:
  parallel: true
  jobs:
    - name: biome
      glob: "*.{js,ts,tsx,json,css}"
      run: npx @biomejs/biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}
      stage_fixed: true

pre-push:
  jobs:
    - name: types
      run: pnpm check-types

commit-msg:
  jobs:
    - name: commitlint
      run: pnpm commitlint --edit {1}
```

**Changes from current:**
- Format: `commands` -> `jobs` (lefthook v2)
- Runner: kept `npx @biomejs/biome` (faster startup than `pnpm biome` for pre-commit)
- Glob: aligned with biome.json `files.includes` (`*.{js,ts,tsx,json,css}`)
- Added `parallel: true` on pre-commit
- Added `pre-push` with type check
- Added `commit-msg` with commitlint

## 5. Commitlint

**Install:**

```bash
pnpm add -D -w @commitlint/cli @commitlint/config-conventional
```

**File:** `commitlint.config.mjs` (new, ESM — root package.json has no `"type": "module"`)

```js
/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
};
```

This enforces the conventional commits format (`feat:`, `fix:`, `chore:`, etc.) that the project already follows by convention (visible in git log).
