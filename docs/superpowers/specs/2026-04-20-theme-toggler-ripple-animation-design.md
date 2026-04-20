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

1. `import { useTheme } from "next-themes";` → `import { useTheme } from "@/lib/theme";` (only in `animated-theme-toggler.tsx` and `theme-toggler.tsx`)
2. `@/shared/components/ui/*` → `@opentab/ui/components/*`
3. `@/shared/components/magicui/animated-theme-toggler` → `./animated-theme-toggler` (local, same dir)
4. `@/shared/lib/utils` → `@opentab/ui/lib/utils`
5. `import * as TogglePrimitive from "@radix-ui/react-toggle";` → `import { Toggle as TogglePrimitive } from "radix-ui";`
6. `import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";` → `import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";`
7. Hard-coded English `aria-label` strings → i18next `t(...)` calls using existing keys `sidebar.theme_label`, `sidebar.theme_{mode}` (both already in locale files).

## Runtime Adaptations (Beyond Search-and-Replace)

### `useTheme` return shape

The migrated files expect `{ theme, setTheme }` from `next-themes`. OpenTab's `useTheme` returns `{ mode, cycleTheme, setTheme }`. Adapt the destructurings in both migrated components:

- `const { theme, setTheme } = useTheme();` → `const { mode: theme, setTheme, cycleTheme } = useTheme();` (alias `mode` as `theme` to minimize body diffs), OR rename all `theme` usages to `mode` for consistency with OpenTab conventions — we go with the rename, since the file is now OpenTab code.

### `AnimatedThemeToggler` — 2-state → 3-mode

The reference `AnimatedThemeToggler` is hard-coded to toggle between `light` and `dark` and manually mutates `document.documentElement.classList.toggle("dark")`. Adapt as follows:

- **Click behavior**: call `cycleTheme(buttonRef.current)` (anchored) instead of `setTheme(dark ? "dark" : "light")`. The hook owns the 3-mode cycle, effective-color guard, and animation orchestration.
- **Icon selection**: use the `ICON[mode]` map (`system → Monitor`, `light → Sun`, `dark → Moon`) — matches current sidebar behavior and covers the `system` mode the reference version cannot represent.
- **Remove inline `document.startViewTransition` + `clipPath` animation code**: move this logic into `useTheme().cycleTheme(anchor)` so it applies to any future caller passing an anchor. The component is reduced to: a ref, an `onClick` handler, and the icon.

The resulting `animated-theme-toggler.tsx` becomes a thin visual wrapper. Its core value (the circular clip-path reveal) now lives in `theme.ts`, where it can be triggered from other anchors if needed.

### `ThemeToggler` variants

The reference component exposes three types: `icon`, `button`, `toggle`.

- `type="icon"` (default): renders `<AnimatedThemeToggler />`. **Used by sidebar.**
- `type="button"`: renders a static `<Button>` with a `SunDim` icon — the reference version is a stub (the button doesn't actually toggle). Keep the variant as migrated but flag it as a placeholder in a code comment; do not wire it into any call site.
- `type="toggle"`: renders a `<ToggleGroup>` with 3 items (light/dark/system). Migrated and exported for future use (Settings page could adopt it later), but not wired in this iteration.

All three variants share OpenTab's `useTheme()` for state.

## Wiring Changes

| File | Change |
|---|---|
| `apps/extension/src/components/layout/workspace-sidebar.tsx` | Replace the inline `<Tooltip><Button onClick={cycleTheme}>…</Button></Tooltip>` block (lines 278-294) with `<ThemeToggler type="icon" />`. Keep the surrounding Tooltip if the new component does not provide one; otherwise remove the wrapper. Plan step decides based on migrated code. |

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
| `packages/ui/src/components/sonner.tsx` | **New (migrated)** |
| `packages/ui/package.json` | **Modified.** Add `sonner` to deps; add 3 new `exports` entries. |
| `apps/extension/src/components/animated-theme-toggler.tsx` | **New (migrated + adapted).** Thin visual wrapper; animation logic lives in the hook. |
| `apps/extension/src/components/theme-toggler.tsx` | **New (migrated + adapted).** 3 variants; default `icon` used by sidebar. |
| `apps/extension/src/lib/theme.ts` | **Modified.** `cycleTheme(anchor?)` + animation orchestration + lock. |
| `apps/extension/src/components/layout/workspace-sidebar.tsx` | **Modified.** One-line swap to `<ThemeToggler type="icon" />`. |
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

- **`lucide-react ^1.7.0` vs reference `^0.543.0`**: icon availability must be verified before migration. Specifically `SunDim` (used in the `type="button"` stub). If missing, substitute with the closest available (`Sun`) in that variant.
- **`radix-ui` unified package export names**: confirm `radix-ui` actually exports both `Toggle` and `ToggleGroup` namespaces; if not, the migrated files must fall back to installing the per-package radix deps.
- **TypeScript `startViewTransition` typing**: may need a local ambient `.d.ts`.
- **Flicker on transition teardown**: both `setMode` and `applyTheme` run inside the same `flushSync`, so VT captures atomically.

## Implementation Order (Build Sequence)

1. **Migrate UI primitives** to `packages/ui`: copy `toggle.tsx`, `toggle-group.tsx`, `sonner.tsx`; apply mechanical replacements (imports, `cn` path, radix unified-package form); update `packages/ui/package.json` (add `sonner` dep + 3 exports). Type-check `packages/ui` passes.
2. **Migrate `animated-theme-toggler.tsx`** to `apps/extension/src/components/`: replace `useTheme`, strip the inline `startViewTransition` code (now lives in hook), rewire to `cycleTheme(buttonRef.current)`, swap icon logic to `ICON[mode]`.
3. **Migrate `theme-toggler.tsx`** to `apps/extension/src/components/`: adapt imports, `useTheme` destructuring, i18n `aria-label`s; keep all 3 variants, comment `type="button"` as placeholder.
4. **Extend `useTheme().cycleTheme`** to accept `anchor?` and orchestrate the View Transition + animate + lock.
5. **Write unit tests** for `cycleTheme` (7 cases). All pass.
6. **Swap sidebar button** for `<ThemeToggler type="icon" />` in `workspace-sidebar.tsx`.
7. **Write component tests** for the `icon` variant (3 cases). All pass.
8. **Manual verification**: cycle sidebar → observe ripple; toggle OS reduced-motion → confirm instant swap; open two extension tabs → click in one → other updates without ghost ripple.

Each step leaves the app in a working state.
