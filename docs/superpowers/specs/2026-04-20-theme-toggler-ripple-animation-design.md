# Theme Toggler Ripple Animation — Design

**Date:** 2026-04-20
**Branch:** `feat/theme-toggler-ripple`
**Owner:** zhaolion

## Goal

Replace the sidebar's instant theme class-swap with a smooth circular ripple reveal by migrating an existing `ThemeToggler` component (and its minimum dependency tree) into OpenTab, then adapting it to OpenTab's 3-mode (`system / light / dark`) theme model and `@opentab/ui` component package.

## Non-Goals (YAGNI)

- **Not a redesign.** We migrate the component verbatim, then adapt imports, `useTheme`, and the animated toggler's 2-state logic to our 3-mode cycle. No bespoke component built from scratch.
- **Not a Settings page change.** The existing hand-rolled 3-button radio group in `settings/App.tsx:184-201` stays. The migrated `<ThemeToggler type="toggle" />` variant is available but not wired in this iteration.
- **Not a batch shadcn library import.** Only the components that the migrated `ThemeToggler` component tree actually references (`toggle`, `toggle-group`) plus `sonner` (explicitly requested) are added to `@opentab/ui`. Other shadcn components the reference project exposes are out of scope.
- **No cross-tab animation.** Only the tab receiving the user click animates; other tabs update instantly via the existing `SETTINGS_CHANGED` broadcast.
- **No user-facing configuration** of animation duration, easing, or an enable/disable flag.

## Migration Scope

### Files to migrate

| Source (reference project) | Target (OpenTab) |
|---|---|
| `shared/components/ui/toggle.tsx` | `packages/ui/src/components/toggle.tsx` |
| `shared/components/ui/toggle-group.tsx` | `packages/ui/src/components/toggle-group.tsx` |
| `shared/components/ui/sonner.tsx` | `packages/ui/src/components/sonner.tsx` |
| `shared/components/magicui/animated-theme-toggler.tsx` | `apps/extension/src/components/animated-theme-toggler.tsx` |
| `shared/blocks/common/theme-toggler.tsx` | `apps/extension/src/components/theme-toggler.tsx` |

### Dependency changes

- **Add** `sonner` to `packages/ui/package.json` `dependencies`.
- **No new `@radix-ui/react-*` packages.** OpenTab's `packages/ui` already depends on the unified `radix-ui ^1.4.3` package, which re-exports all Radix primitives including `Toggle` and `ToggleGroup`. The migration must convert per-package imports (`import * as TogglePrimitive from "@radix-ui/react-toggle"`) to the unified-package form (`import { Toggle as TogglePrimitive } from "radix-ui"`).
- **`lucide-react`** version stays at OpenTab's `^1.7.0`. Verify the icons the migrated files use (`SunDim`, `Moon`, `Monitor`, `Sun`) are exported by this version.

### `packages/ui/package.json` — `exports` additions

```json
"./components/toggle": "./src/components/toggle.tsx",
"./components/toggle-group": "./src/components/toggle-group.tsx",
"./components/sonner": "./src/components/sonner.tsx"
```

## Mechanical Adaptations During Migration

Apply these globally to every migrated file (search-and-replace, case-sensitive):

1. `import { useTheme } from "next-themes";` → `import { useTheme } from "@/lib/theme";` — **only in `animated-theme-toggler.tsx` and `theme-toggler.tsx`**. For `sonner.tsx` see Runtime Adaptations (sonner becomes theme-prop-driven; `packages/ui` must not import `next-themes` nor the extension-local `@/lib/theme`).
2. `@/shared/components/ui/*` → `@opentab/ui/components/*`
3. `@/shared/components/magicui/animated-theme-toggler` → `./animated-theme-toggler` (local, same dir)
4. `@/shared/lib/utils` → `@opentab/ui/lib/utils`
5. `import * as TogglePrimitive from "@radix-ui/react-toggle";` → `import { Toggle as TogglePrimitive } from "radix-ui";`
6. `import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";` → `import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";`
7. Hard-coded English `aria-label` strings → i18next `t(...)` calls using existing keys `sidebar.theme_label`, `sidebar.theme_{mode}` (both already in locale files).

## Runtime Adaptations (Beyond Search-and-Replace)

### `useTheme` return shape

The migrated files expect `{ theme, setTheme }` from `next-themes`. OpenTab's `useTheme` returns `{ mode, cycleTheme, setTheme }`. Rename all `theme` usages to `mode` in the migrated components (keeps OpenTab conventions; file is now OpenTab code).

### `sonner.tsx` — strip `next-themes`, pass theme via prop

The migrated sonner wrapper must not import `next-themes` (not a `packages/ui` dependency) and must not import `@/lib/theme` (extension-only alias). Adapt by removing the internal theme hook and `mounted` guard; caller passes `theme` explicitly:

```tsx
// packages/ui/src/components/sonner.tsx
"use client";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ theme = "system", ...props }: ToasterProps) => (
  <Sonner
    theme={theme}
    className="toaster group"
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
      } as CSSProperties
    }
    {...props}
  />
);

export { Toaster };
```

Import `CSSProperties` as a type-only import — with TS's `react-jsx` transform, the `React` namespace is not in scope, so the reference version's `as React.CSSProperties` would fail `tsc --noEmit`.

`ToasterProps["theme"]` from `sonner` is already `"light" | "dark" | "system"`, so callers wiring this in the extension pass `mode` directly: `<Toaster theme={mode} />`. No call site is wired in this iteration — this is infrastructure only.

### `AnimatedThemeToggler` — 2-state → 3-mode + ref/props forwarding

The reference `AnimatedThemeToggler` is hard-coded to toggle between `light` and `dark` and manually mutates `document.documentElement.classList.toggle("dark")`. Adapt as follows:

- **Click behavior**: call `cycleTheme(internalButtonRef.current)` (anchored) instead of `setTheme(dark ? "dark" : "light")`. The hook owns the 3-mode cycle, effective-color guard, and animation orchestration.
- **Icon selection**: use the `ICON[mode]` map (`system → Monitor`, `light → Sun`, `dark → Moon`) — matches current sidebar behavior and covers the `system` mode the reference version cannot represent. Drops `SunDim` import; avoids verifying `SunDim` availability in `lucide-react ^1.7.0`.
- **Remove inline `document.startViewTransition` + `clipPath` animation code**: move this logic into `useTheme().cycleTheme(anchor)` so it applies to any future caller passing an anchor.
- **Forward ref and spread props**: the adapted component must accept a `ref?: React.Ref<HTMLButtonElement>` prop and spread any remaining `React.ButtonHTMLAttributes<HTMLButtonElement>` onto the root `<button>`. Merge the external ref with the internal `buttonRef` via a callback-ref helper. **Required so the outer `<Tooltip><TooltipTrigger asChild>` in the sidebar continues to work** — Radix injects `aria-describedby` and event handlers via props, and positions the tooltip using the forwarded ref. Without this, the sidebar tooltip silently breaks.

The resulting `animated-theme-toggler.tsx` exposes a single `<button>` root with: merged ref, `...rest` props spread, our `onClick`, and an `aria-label` fed by a `label` prop (caller-localized).

### `ThemeToggler` variants — drop `type="button"` stub

The reference component exposes three types: `icon`, `button`, `toggle`. The `button` variant renders a static outline `<Button>` with no `onClick` — it is dead code in the reference. Drop it during migration. Final variants:

- `type="icon"` (default): renders `<AnimatedThemeToggler />`. **Used by sidebar.** Must also forward `ref` and `...props` so the outer sidebar Tooltip works.
- `type="toggle"`: renders a `<ToggleGroup>` with 3 items (light/dark/system). Migrated and exported for future Settings-page adoption; not wired in this iteration. See type-narrowing rule below.

No `SunDim` import remains after this drop.

### `type="toggle"` — narrow `onValueChange` to `ThemeMode`

The reference `handleThemeChange = (value: string) => setTheme(value)` fails TypeScript against OpenTab's `setTheme: (next: ThemeMode) => Promise<void>`. Adapt:

```tsx
const THEME_VALUES = ["system", "light", "dark"] as const satisfies readonly ThemeMode[];

function isThemeMode(value: string): value is ThemeMode {
  return (THEME_VALUES as readonly string[]).includes(value);
}

const handleThemeChange = (value: string) => {
  if (isThemeMode(value)) {
    void setTheme(value);
  }
};
```

`ToggleGroup`'s `value` is emitted as `string` (empty string when nothing selected in single-mode). The guard drops the empty-string case and narrows to `ThemeMode` before calling `setTheme`.

## Wiring Changes

| File | Change |
|---|---|
| `apps/extension/src/components/layout/workspace-sidebar.tsx` | **Keep** the existing `<Tooltip><TooltipTrigger asChild>...<TooltipContent/>` wrapper (lines 280-294). Replace only the inner `<Button>` block (lines 282-289) with `<ThemeToggler type="icon" aria-label={label} />`. Preserves the tooltip copy and localization without re-implementing it inside the migrated component. `TooltipContent` text comes from the existing i18n key (unchanged). **Also remove the now-unused bindings left behind by the swap** — see next section. |

This works because the adapted `ThemeToggler` (`type="icon"`) forwards `ref` and `...props` to its root `<button>`, so Radix's `<TooltipTrigger asChild>` can inject its control props. Without the ref/props forwarding adaptation above, this wiring would silently break the tooltip.

### Sidebar dead-code cleanup (required to pass lint)

Biome's `recommended: true` (see `biome.json`) enables `noUnusedImports` and `noUnusedVariables`. After the swap, the following become unreferenced and must be removed in the **same change** as the wiring update:

| Line(s) in `workspace-sidebar.tsx` | Dead after swap | Action |
|---|---|---|
| `10-16` (icon import group) | `Monitor`, `Moon`, `Sun` | Remove from the `lucide-react` import list. Keep `ChevronLeft`, `Download`, `PanelLeft`, `Plus`, `Settings`, `Upload`. |
| `33` | `const THEME_ICON = {…} as const;` | Delete the line. |
| `100` | `const { mode, cycleTheme } = useTheme();` | Drop `cycleTheme`; keep `mode` — still used at lines 286 and 292 for the Tooltip aria-label/content. New: `const { mode } = useTheme();` |
| `105` | `const ThemeIcon = THEME_ICON[mode];` | Delete the line. |

`pnpm --filter @opentab/extension lint` must pass after step 6 of the Implementation Order.

No other wiring changes.

## Hook Change: `cycleTheme(anchor?)`

Current signature in `apps/extension/src/lib/theme.ts:61-67`:

```ts
const cycleTheme = useCallback(async () => { /* advance mode + save */ }, [mode]);
```

New signature:

```ts
const cycleTheme = useCallback(
  async (anchor?: HTMLElement | null) => { /* advance mode + optionally animate + save */ },
  [mode],
);
```

An `isAnimatingRef = useRef(false)` is added inside the hook body for the in-flight lock.

### Decision tree (pseudo-code)

```
cycleTheme(anchor):
  if isAnimatingRef.current: return
  next = CYCLE[(CYCLE.indexOf(mode) + 1) % 3]
  shouldAnimate =
    anchor != null &&
    typeof document.startViewTransition === "function" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    resolveEffective(mode) !== resolveEffective(next)

  if !shouldAnimate:
    setMode(next)
    applyTheme(next)
    await saveSettings({ theme: next })
    return

  isAnimatingRef.current = true
  try:
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setMode(next)
        applyTheme(next)
      })
    })
    await transition.ready

    const rect = anchor.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const maxRad = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRad}px at ${x}px ${y}px)`] },
      { duration: 400, easing: "ease-out", pseudoElement: "::view-transition-new(root)" },
    )

    await transition.finished
  finally:
    isAnimatingRef.current = false
    await saveSettings({ theme: next })
```

### Key points

- **`flushSync` inside the transition callback** ensures React commits the state update and `applyTheme` mutates the `<html>` class list before View Transitions captures the "new" snapshot.
- **Persistence after the animation** (`saveSettings` in `finally`) keeps the ripple visually leading. The write is idempotent and non-blocking for UX.
- **Effective-color guard** uses the existing `resolveEffective(mode)` helper in `theme.ts:5-10`. Cycling `system → light` while OS is light returns the same effective color → no animation.
- **Lock cleared on `transition.finished`**, not a timer. Tracks actual animation, not a magic number.
- **TypeScript**: `document.startViewTransition` may be absent from older `lib.dom`. Narrow via `typeof` check; if TS complains, add a minimal ambient `.d.ts` declaration.

## Fallback Matrix

| Condition | Behavior |
|---|---|
| `anchor` is null/omitted (initial mount, cross-tab handler, Settings' `setTheme`) | Instant swap. |
| `typeof document.startViewTransition !== "function"` | Instant swap. |
| `matchMedia("(prefers-reduced-motion: reduce)").matches` | Instant swap. |
| `resolveEffective(mode) === resolveEffective(next)` | Instant swap. |
| `document.startViewTransition` throws synchronously (defensive) | Caught; instant swap; `console.warn`. |
| `saveSettings` rejects (Dexie error) | `console.error`; mode already updated in memory and on DOM; persistence skipped for this call. Matches current behavior. |

## Cross-Tab Behavior

Unchanged. `saveSettings` broadcasts `SETTINGS_CHANGED`; other extension tabs' `useTheme` listener (`theme.ts:34-45`) picks it up and calls `applyTheme(newMode)` directly — no anchor → no animation in passive tabs, which is correct.

## Animation Parameters

| Property | Value | Rationale |
|---|---|---|
| Duration | 400ms | Shorter than the reference's 700ms — the sidebar button sits close to viewport edges, so the ripple completes faster physically. |
| Easing | `ease-out` | Decelerates as the ripple fills the viewport. |
| Clip path | Circle from button center to `max(distance_to_any_corner)` | Guarantees full viewport coverage regardless of button position. |
| Pseudo-element | `::view-transition-new(root)` | Standard VT target. |

Constants live next to `cycleTheme` for easy tuning.

## Files Touched (Summary)

| Path | Change |
|---|---|
| `packages/ui/src/components/toggle.tsx` | **New (migrated)** |
| `packages/ui/src/components/toggle-group.tsx` | **New (migrated)** |
| `packages/ui/src/components/sonner.tsx` | **New (migrated + adapted).** `useTheme` stripped; `theme` comes via prop. |
| `packages/ui/package.json` | **Modified.** Add `sonner` to deps; add 3 new `exports` entries. |
| `apps/extension/src/components/animated-theme-toggler.tsx` | **New (migrated + adapted).** Ref-forwarding + props-spread button; no inline VT code; uses `cycleTheme(buttonRef)`. |
| `apps/extension/src/components/theme-toggler.tsx` | **New (migrated + adapted).** Two variants: `icon` (default, sidebar) and `toggle` (future Settings use); `type="button"` stub dropped. |
| `apps/extension/src/lib/theme.ts` | **Modified.** `cycleTheme(anchor?)` + animation orchestration + lock. |
| `apps/extension/src/components/layout/workspace-sidebar.tsx` | **Modified.** Swap only the inner `<Button>` for `<ThemeToggler type="icon" />`; keep outer `<Tooltip>` wrapper. |
| `apps/extension/vitest.config.ts` | **Modified.** `environment: "jsdom"`, `include: ["src/**/*.test.{ts,tsx}"]`, setup file for Testing Library matchers. |
| `apps/extension/package.json` | **Modified.** Add devDeps: `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/dom`. |
| `apps/extension/vitest.setup.ts` | **New.** `import "@testing-library/jest-dom/vitest";` |
| `apps/extension/src/lib/__tests__/theme.test.ts` | **New.** Unit tests for `cycleTheme` paths. |
| `apps/extension/src/components/__tests__/theme-toggler.test.tsx` | **New.** Component render + click tests. |

## Testing

### Unit tests — `lib/__tests__/theme.test.ts`

Vitest + jsdom. Mock `document.startViewTransition`, `document.documentElement.animate`, `window.matchMedia` per-test.

Cases:
1. `cycleTheme()` no anchor → instant: `startViewTransition` NOT called, `applyTheme` and `saveSettings` called with `next`.
2. `cycleTheme(buttonEl)` happy path: `startViewTransition` called, `flushSync(applyTheme)` inside, `documentElement.animate` called with correct clip-path endpoints.
3. `prefers-reduced-motion: reduce` → instant even with anchor.
4. `startViewTransition` undefined → instant even with anchor.
5. Cycle step with unchanged effective color (OS-light + `system → light`) → instant.
6. Second `cycleTheme(buttonEl)` while first is in flight → second returns immediately; `startViewTransition` call count stays at 1.
7. After `transition.finished`, subsequent call proceeds (lock released).

### Component tests — `components/__tests__/theme-toggler.test.tsx`

Testing Library + vitest + jsdom. Mock `useTheme`. Cover the `type="icon"` variant (the only wired variant).

Cases:
1. `type="icon"` renders `Monitor` when `mode === "system"`, `Sun` for `light`, `Moon` for `dark`.
2. Click invokes `cycleTheme` with a non-null `HTMLButtonElement`.
3. `aria-label` present and matches the i18n key for current mode.

`type="toggle"` and `type="button"` variants not asserted (migrated but not wired; deferred until adopted).

View Transition visuals not asserted (jsdom limitation; hook tests cover call sites).

## Open Risks

- **`radix-ui` unified package export names**: `Toggle` and `ToggleGroup` namespaces confirmed present in `radix-ui ^1.4.3` (verified during plan review). Low residual risk.
- **TypeScript `startViewTransition` typing**: may need a local ambient `.d.ts`.
- **Flicker on transition teardown**: both `setMode` and `applyTheme` run inside the same `flushSync`, so VT captures atomically.
- **Testing Library version drift**: `@testing-library/react` must match React 19. Install the latest `^16` line which supports React 19 concurrent rendering.

## Implementation Order (Build Sequence)

0. **Set up test infrastructure in `apps/extension`** — **must come before any step that adds tests**:
   - `pnpm add -D -F @opentab/extension jsdom @testing-library/react@^16 @testing-library/jest-dom @testing-library/dom`
   - Update `vitest.config.ts`: `test.environment = "jsdom"`, `test.include = ["src/**/*.test.{ts,tsx}"]`, `test.setupFiles = ["./vitest.setup.ts"]`.
   - Create `apps/extension/vitest.setup.ts` with `import "@testing-library/jest-dom/vitest";`.
   - Re-run existing `pnpm --filter @opentab/extension test` (the collection-sort/dedup node tests) to confirm the env change doesn't regress them.
1. **Migrate UI primitives** to `packages/ui`: copy `toggle.tsx`, `toggle-group.tsx`, `sonner.tsx`; apply mechanical replacements (imports, `cn` path, radix unified-package form); **adapt `sonner.tsx` to take `theme` via prop** (strip `next-themes`, remove `mounted` state); update `packages/ui/package.json` (add `sonner` dep + 3 exports). `pnpm --filter @opentab/ui check-types` passes.
2. **Migrate `animated-theme-toggler.tsx`** to `apps/extension/src/components/`: strip inline VT code, switch to `cycleTheme(buttonRef.current)`, swap icons to `ICON[mode]`, add ref-forwarding + props-spread on the root `<button>`.
3. **Migrate `theme-toggler.tsx`** to `apps/extension/src/components/`: drop `type="button"` stub; adapt imports, `useTheme` destructuring, i18n `aria-label`s; add the `isThemeMode` narrowing for `type="toggle"`.
4. **Extend `useTheme().cycleTheme`** to accept `anchor?` and orchestrate the View Transition + animate + lock.
5. **Write unit tests** for `cycleTheme` (7 cases). All pass.
6. **Swap sidebar inner Button** for `<ThemeToggler type="icon" aria-label={label} />` in `workspace-sidebar.tsx`; keep the outer `<Tooltip>` wrapper intact. In the same commit, remove the now-unused bindings (`THEME_ICON` const, `ThemeIcon` local, `cycleTheme` destructure, and `Monitor`/`Moon`/`Sun` icon imports) — see the cleanup table under Wiring Changes. `pnpm --filter @opentab/extension lint` must pass.
7. **Write component tests** for the `icon` variant (3 cases). All pass.
8. **Manual verification**: cycle sidebar → observe ripple; toggle OS reduced-motion → confirm instant swap; open two extension tabs → click in one → other updates without ghost ripple; hover sidebar button → confirm Tooltip still appears.

Each step leaves the app in a working state.
