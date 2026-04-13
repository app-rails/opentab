# CI & Dev Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub CI, Dependabot, Claude Code shared settings, lefthook v2 hooks, and conventional commit enforcement to the OpenTab monorepo.

**Architecture:** Config-only changes across GitHub workflows, lefthook, Claude Code settings, and a new commitlint config. No runtime code changes. The `.gitignore` must be updated to allow committing `.claude/settings.json` while keeping the rest of `.claude/` ignored.

**Tech Stack:** GitHub Actions, Dependabot, lefthook v2, Biome, commitlint, pnpm

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `.github/workflows/ci.yml` | CI: lint + type-check on push & PR |
| Create | `.github/dependabot.yml` | Automated dependency updates |
| Modify | `.gitignore` | Un-ignore `.claude/settings.json` |
| Create | `.claude/settings.json` | Shared Claude Code permissions (committed) |
| Modify | `.claude/settings.local.json` | Personal-only Claude Code permissions |
| Modify | `lefthook.yml` | Git hooks: biome, type-check, commitlint |
| Modify | `package.json` | Add commitlint devDependencies |
| Create | `commitlint.config.mjs` | Conventional commit rules |

---

### Task 1: GitHub CI Workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace CI workflow**

Overwrite `.github/workflows/ci.yml` with:

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

      - name: Biome lint
        run: pnpm biome check .

      - name: Type check
        run: pnpm check-types
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"`
Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add PR trigger, concurrency, frozen-lockfile, split lint and type-check"
```

---

### Task 2: Dependabot

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create dependabot config**

Create `.github/dependabot.yml`:

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

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/dependabot.yml'))" && echo "YAML OK"`
Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add Dependabot for npm and GitHub Actions"
```

---

### Task 3: Claude Code Shared Settings

**Files:**
- Modify: `.gitignore`
- Create: `.claude/settings.json`
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Un-ignore `.claude/settings.json` in `.gitignore`**

Currently `.gitignore` line 37 has `.claude/`. Add a negation line immediately after it:

```gitignore
.claude/
!.claude/settings.json
```

- [ ] **Step 2: Verify gitignore works**

Run: `git check-ignore -v .claude/settings.json && echo "STILL IGNORED" || echo "NOT IGNORED (correct)"`
Expected: `NOT IGNORED (correct)`

Also verify `.claude/settings.local.json` is still ignored:
Run: `git check-ignore -v .claude/settings.local.json`
Expected: output showing `.gitignore` rule matches (still ignored)

- [ ] **Step 3: Create shared settings file**

Create `.claude/settings.json`:

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

- [ ] **Step 4: Trim local settings**

Replace `.claude/settings.local.json` with only the personal permissions not covered by the shared file:

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

- [ ] **Step 5: Verify shared settings is trackable**

Run: `git add .claude/settings.json && git status`
Expected: `.claude/settings.json` appears as "new file" in staged changes. `.claude/settings.local.json` does NOT appear.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .claude/settings.json
git commit -m "chore: add shared Claude Code settings, split local overrides"
```

---

### Task 4: Lefthook v2 Migration

**Files:**
- Modify: `lefthook.yml`

- [ ] **Step 1: Replace lefthook config**

Overwrite `lefthook.yml` with:

```yaml
pre-commit:
  parallel: true
  jobs:
    - name: biome
      glob: "*.{js,ts,tsx,json,css}"
      run: pnpm biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}
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

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('lefthook.yml'))" && echo "YAML OK"`
Expected: `YAML OK`

- [ ] **Step 3: Commit**

Note: The `commit-msg` hook references `commitlint` which is installed in Task 5. This commit uses the old hooks (no commitlint yet), which is fine.

```bash
git add lefthook.yml
git commit -m "chore: migrate lefthook to v2 jobs format, add pre-push and commit-msg hooks"
```

---

### Task 5: Commitlint

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `commitlint.config.mjs`

- [ ] **Step 1: Install commitlint**

Run: `pnpm add -D -w @commitlint/cli @commitlint/config-conventional`

- [ ] **Step 2: Verify installation**

Run: `pnpm commitlint --version`
Expected: version number printed (e.g. `19.x.x`)

- [ ] **Step 3: Create commitlint config**

Create `commitlint.config.mjs`:

```js
/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
};
```

- [ ] **Step 4: Test commitlint against a valid message**

Run: `echo "feat: add test feature" | pnpm commitlint`
Expected: exit 0, no errors

- [ ] **Step 5: Test commitlint against an invalid message**

Run: `echo "bad message" | pnpm commitlint 2>&1; echo "exit: $?"`
Expected: exit 1, error about subject format

- [ ] **Step 6: Re-install lefthook to pick up new commit-msg hook**

Run: `pnpm lefthook install`
Expected: `lefthook install` output confirming hooks installed

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml commitlint.config.mjs
git commit -m "chore: add commitlint with conventional commit enforcement"
```

This commit itself will be validated by the newly installed commit-msg hook, confirming the full pipeline works end-to-end.

---

### Task 6: Smoke Test

- [ ] **Step 1: Test pre-commit hook**

Create a throwaway file to trigger biome:

```bash
echo "const   x=1;" > /tmp/test-hook.ts
cp /tmp/test-hook.ts test-hook.ts
git add test-hook.ts
git commit -m "test: smoke test pre-commit hook"
```

Expected: lefthook runs biome, auto-fixes the formatting (`const x = 1;`), stages the fixed file, commit succeeds.

- [ ] **Step 2: Verify biome fixed the file**

Run: `cat test-hook.ts`
Expected: `const x = 1;` (formatted)

- [ ] **Step 3: Test commit-msg rejection**

```bash
echo "// throwaway" > test-hook2.ts
git add test-hook2.ts
git commit -m "bad message" 2>&1; echo "exit: $?"
```

Expected: exit 1, commitlint rejects the message.

- [ ] **Step 4: Clean up**

```bash
git reset HEAD test-hook2.ts
rm -f test-hook.ts test-hook2.ts
git revert HEAD --no-edit
```

This reverts the smoke-test commit, leaving a clean history.

- [ ] **Step 5: Verify clean state**

Run: `git status`
Expected: working tree clean (or only the spec file as untracked)
