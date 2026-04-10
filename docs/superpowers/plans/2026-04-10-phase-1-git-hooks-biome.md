# Phase 1: Git Hooks + Biome Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated code quality gate via lefthook pre-commit hooks + Tailwind class sorting via Biome.

**Architecture:** Install lefthook for git hooks (lightweight, single binary). Configure pre-commit to run `biome check --write` on staged files only. Add `useSortedClasses` rule to biome.json for JSX className sorting.

**Tech Stack:** lefthook (git hooks), Biome 2.4.9 (linter/formatter)

**Important context:** This repo is a **git worktree** — `.git` is a file pointing to the main repo at `/Users/liang.zhao/code/github/app-rails/opentab/.git/worktrees/amarillo-v1`. Lefthook must handle this correctly.

---

### Task 1: Install lefthook

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install lefthook as devDependency**

Run:
```bash
pnpm add -D lefthook -w
```

Expected: `lefthook` appears in root `package.json` devDependencies.

- [ ] **Step 2: Verify lefthook can find the git repo in worktree mode**

Run:
```bash
npx lefthook version
```

Expected: Prints lefthook version without errors. If it fails with a "not a git repository" error, the worktree is not being detected — see troubleshooting in Step 3.

- [ ] **Step 3: Install lefthook git hooks**

Run:
```bash
npx lefthook install
```

Expected: Prints something like `SERVED SUCCESSFULLY`. This creates `.git/hooks/pre-commit` (or in the worktree's hooks directory). If this fails because `.git` is a file (worktree), lefthook v1.6+ handles this natively — verify you have a recent enough version.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install lefthook for git hooks"
```

---

### Task 2: Create lefthook.yml

**Files:**
- Create: `lefthook.yml`

- [ ] **Step 1: Create lefthook.yml with pre-commit config**

Create `lefthook.yml` in the repo root:

```yaml
pre-commit:
  commands:
    biome-check:
      glob: "*.{ts,tsx,js,json,css}"
      run: npx @biomejs/biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}
      stage_fixed: true
```

Key details:
- `glob`: Only runs on file types Biome handles.
- `{staged_files}`: Lefthook substitutes with the list of staged files — avoids formatting unstaged changes.
- `stage_fixed: true`: Re-stages any files that Biome auto-fixed, so the commit includes the fixes.
- `--no-errors-on-unmatched`: Prevents errors when staged files don't match Biome's includes.
- `--files-ignore-unknown=true`: Skips files Biome doesn't know how to handle.

- [ ] **Step 2: Test the hook with a dummy change**

Create a deliberately mis-formatted file to test:

```bash
echo 'const x = 1 ;' > /tmp/test-hook.ts
cp /tmp/test-hook.ts test-hook.ts
git add test-hook.ts
git commit -m "test: verify pre-commit hook"
```

Expected: The pre-commit hook runs, Biome fixes the extra space before `;`, the commit succeeds with the fixed file. Verify:

```bash
cat test-hook.ts
```

Should show `const x = 1;` (no extra space).

- [ ] **Step 3: Clean up test file**

```bash
git rm test-hook.ts
git commit -m "chore: remove hook test file"
```

- [ ] **Step 4: Commit lefthook.yml**

```bash
git add lefthook.yml
git commit -m "chore: add lefthook pre-commit config for biome"
```

---

### Task 3: Add useSortedClasses to Biome

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: Update biome.json to add useSortedClasses rule**

Current `biome.json` linter section (lines 13-20):

```json
  "linter": {
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off"
      }
    }
  },
```

Replace with:

```json
  "linter": {
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off"
      },
      "nursery": {
        "useSortedClasses": "warn"
      }
    }
  },
```

This adds `useSortedClasses` under `linter.rules.nursery` (NOT `css.linter` — it's a JS/JSX rule that sorts `className` attribute strings in TSX files).

- [ ] **Step 2: Verify the rule is recognized by Biome**

Run:
```bash
pnpm check
```

Expected: Biome runs without configuration errors. It may report warnings for unsorted Tailwind classes in existing `.tsx` files — that's expected and correct. The warnings confirm the rule is active.

- [ ] **Step 3: Check how many files would be affected**

Run:
```bash
npx @biomejs/biome check . 2>&1 | grep -c "useSortedClasses" || echo "0 matches"
```

This tells you how many existing files have unsorted Tailwind classes. This is informational — we don't need to fix them all now (the rule is `warn`, not `error`).

- [ ] **Step 4: Commit**

```bash
git add biome.json
git commit -m "chore: add useSortedClasses rule for Tailwind class sorting"
```

---

### Task 4: Add lefthook install to postinstall script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add postinstall script to package.json**

Add a `postinstall` script so lefthook hooks are installed automatically when anyone runs `pnpm install`:

Current scripts section:

```json
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "format": "biome format --write .",
    "check": "biome check ."
  },
```

Replace with:

```json
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "format": "biome format --write .",
    "check": "biome check .",
    "postinstall": "lefthook install"
  },
```

- [ ] **Step 2: Verify postinstall works**

Run:
```bash
pnpm install
```

Expected: After dependencies install, lefthook prints its install message (e.g., `SERVED SUCCESSFULLY`). No errors.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: auto-install lefthook hooks on pnpm install"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Verify the full pre-commit flow works end-to-end**

Make a small whitespace change to any `.ts` file (e.g., add a trailing space):

```bash
cd app-extension/src/lib
echo "" >> utils.ts
git add utils.ts
git commit -m "test: verify full pre-commit pipeline"
```

Expected: Pre-commit hook fires, Biome processes the file, commit succeeds.

- [ ] **Step 2: Verify biome check passes across the whole repo**

Run:
```bash
pnpm check
```

Expected: Exits cleanly (exit code 0). Any `useSortedClasses` warnings are expected (it's `warn` not `error`).

- [ ] **Step 3: Revert the test change if needed**

If the test commit went through:

```bash
git reset HEAD~1
git checkout -- app-extension/src/lib/utils.ts
```

- [ ] **Step 4: Verify git log shows the Phase 1 commits**

Run:
```bash
git log --oneline -5
```

Expected: Shows the 3 commits from this phase:
1. `chore: install lefthook for git hooks`
2. `chore: add lefthook pre-commit config for biome`
3. `chore: add useSortedClasses rule for Tailwind class sorting`
4. `chore: auto-install lefthook hooks on pnpm install`
