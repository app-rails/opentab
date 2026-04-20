# Theme Toggler Ripple Animation — Design

**Date:** 2026-04-20
**Branch:** `feat/theme-toggler-ripple`
**Owner:** zhaolion

## Goal

Upgrade the sidebar theme toggle from an instant class-swap into a smooth circular ripple reveal anchored to the clicked button, using the browser's native View Transitions API. Preserves the existing 3-mode cycle (`system → light → dark → system`) and all current behavior (Dexie persistence, cross-tab sync, system-preference follow).

## Non-Goals (YAGNI)

- No new UI library, no new Radix primitives, no segmented control refactor.
- No animation on the Settings page theme picker (the existing 3-button radio group stays as-is — instant mode selection is the right semantic there).
- No reusable `<ThemeSegmentedControl>` or shared `ToggleGroup` component.
- No cross-tab animation — only the tab that received the user click animates; other tabs update instantly via the existing `SETTINGS_CHANGED` broadcast.
- No animation anchor support for non-user-triggered theme changes (initial mount, cross-tab updates, system-preference changes while `mode === "system"`).
- No user-facing configuration of duration, easing, or enable/disable toggle.

## User Experience

### Sidebar

The sidebar currently shows a single `icon-xs` button at `workspace-sidebar.tsx:282-289` that cycles through `system / light / dark`. Icon matches current mode (`Monitor / Sun / Moon`). Tooltip and `aria-label` already localized via i18next keys `sidebar.theme_label`, `sidebar.theme_{mode}`.

After this change:

- The button is replaced by a `<ThemeToggler />` component with identical visual footprint (same size, same icons, same tooltip copy, same neighbor layout).
- Clicking cycles modes identically, **but** a circular reveal animation plays: a circle clip-path grows from the button's center until it covers the viewport, revealing the new theme underneath.
- When clicking a cycle step that does not actually change the effective color (e.g. `system → light` while the OS preference is already light), the animation is skipped — colors don't change, so a ripple would be misleading.
- Rapid repeat clicks during an active animation are ignored (button stays responsive visually but the second click is dropped until the ripple finishes).

### Settings page

No change. `settings/App.tsx:184-201` keeps its hand-rolled 3-button radio group. Users who want to return to `system` mode continue to use Settings.

## Architecture

The change is localized to the extension app; no new packages, no new npm dependencies. The browser's View Transitions API (Chrome 111+, available in MV3) powers the animation.

### Files touched

| Path | Change |
|---|---|
| `apps/extension/src/components/theme-toggler.tsx` | **New.** ~40-line presentational component. |
| `apps/extension/src/lib/theme.ts` | **Modified.** `cycleTheme` signature gains an optional `anchor` parameter and embeds animation orchestration. |
| `apps/extension/src/components/layout/workspace-sidebar.tsx` | **Modified.** Replace inline `<Tooltip><Button onClick={cycleTheme}>…</Button></Tooltip>` block with `<ThemeToggler />`. |
| `apps/extension/src/lib/__tests__/theme.test.ts` | **New.** Unit tests for `cycleTheme` animation/fallback paths. |
| `apps/extension/src/components/__tests__/theme-toggler.test.tsx` | **New.** Component render + click tests. |

### Responsibility split

- **`<ThemeToggler />`** holds the DOM anchor ref, picks the icon for the current mode, and calls `cycleTheme(buttonRef.current)` on click. Knows nothing about View Transitions, animation lifecycle, or reduced-motion detection. Pure presentation + ref plumbing.
- **`useTheme().cycleTheme(anchor?)`** owns: advancing the mode, computing whether to animate, driving the View Transition, holding the in-flight animation lock, and persisting via `saveSettings`. Animation logic lives here so any future consumer can trigger a ripple by passing an anchor element — no duplication.

## Component: `<ThemeToggler />`

Single button, no internal state beyond refs. Uses `useTheme()` for `mode` and `cycleTheme`, `useTranslation()` for the `aria-label` and tooltip.

```tsx
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggler({ className }: { className?: string }) {
  const { mode, cycleTheme } = useTheme();
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const Icon = ICON[mode];
  const label = t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={buttonRef}
          variant="ghost"
          size="icon-xs"
          onClick={() => cycleTheme(buttonRef.current)}
          aria-label={label}
          className={className}
        >
          <Icon className="size-4 text-sidebar-foreground/70" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
```

Notes:
- Icon follows the current **mode** (`Monitor / Sun / Moon`), not the effective resolved color. Matches the existing sidebar behavior — switching mode to `system` shows `Monitor` even if OS is dark.
- Tooltip and `aria-label` use the same existing i18n keys the old inline button used, so locale files need no changes.
- The component swallows the `className` prop so callers can tweak placement but nothing else — it is a self-contained control.

## Hook change: `cycleTheme(anchor?)`

Current signature (`theme.ts:61-67`):

```ts
const cycleTheme = useCallback(async () => { ... }, [mode]);
```

New signature:

```ts
const cycleTheme = useCallback(
  async (anchor?: HTMLElement | null) => { ... },
  [mode],
);
```

An `isAnimatingRef = useRef(false)` is added inside the hook body.

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

- **`flushSync` inside the transition callback** is required so React commits the state update and `applyTheme` mutates the `<html>` class list before the View Transition captures the "new" snapshot.
- **Persistence after the animation** (`saveSettings` in `finally`) keeps the ripple visually leading. The write is idempotent and non-blocking for UX.
- **Effective-color guard** uses the existing `resolveEffective(mode)` helper in `theme.ts:5-10`. Cycling `system → light` while the OS is in light mode returns the same effective color → no animation.
- **Lock cleared on `transition.finished`**, not on a timer. If the browser throttles or frame-drops, the lock tracks the actual animation, not a magic number.
- **TypeScript**: `document.startViewTransition` may be absent from lib.dom in older TS configs. We'll narrow via `typeof` check; if needed, add a minimal ambient declaration in a local `.d.ts`.

## Fallback matrix

| Condition | Behavior |
|---|---|
| `anchor` is `null` / omitted (e.g. called from Settings via `setTheme`, called on initial load, future programmatic callers) | Instant swap (same as today). |
| `typeof document.startViewTransition !== "function"` | Instant swap. |
| `matchMedia("(prefers-reduced-motion: reduce)").matches` | Instant swap. |
| `resolveEffective(mode) === resolveEffective(next)` | Instant swap. Colors don't change so a ripple would be misleading. |
| `document.startViewTransition` throws synchronously (shouldn't in MV3 Chrome, defensive) | Caught; fall back to instant swap; log at `console.warn`. |
| `saveSettings` rejects (Dexie error, etc.) | Surface via `console.error`; state + DOM already reflect the new mode for this session; persistence just skipped. Matches current behavior on `saveSettings` failure. |

## Cross-tab & multi-window behavior

Unchanged. The current tab calls `saveSettings` which triggers `chrome.runtime.sendMessage({ type: SETTINGS_CHANGED })` (`settings.ts:65`). Other extension tabs' `useTheme` listener (`theme.ts:34-45`) picks it up and calls `applyTheme(newMode)` directly — no `anchor` means no animation, which is correct: those tabs didn't receive the click, their users shouldn't see a ripple originating from an invisible coordinate.

## Animation parameters

| Property | Value | Rationale |
|---|---|---|
| Duration | 400ms | Shorter than a typical "notice" animation (700ms) because a small sidebar button produces a fast, close-to-viewport ripple. |
| Easing | `ease-out` | Decelerates as the ripple hits the edges — matches the way a physical expanding circle loses momentum. |
| Clip path | Circle from button center expanding to `max(distance_to_any_corner)` | Ensures the ripple reaches every pixel, regardless of button position. |
| Pseudo-element | `::view-transition-new(root)` | Standard VT target for the incoming snapshot. |

No user-facing config. These live as constants next to `cycleTheme` so a later revision (or a `--theme-transition-duration` CSS custom property migration) can lift them out easily.

## Testing

### Unit tests — `lib/__tests__/theme.test.ts`

Vitest + jsdom. Mock `document.startViewTransition`, `document.documentElement.animate`, and `window.matchMedia` per-test.

Cases:
1. `cycleTheme()` without anchor → instant path: `startViewTransition` NOT called, `applyTheme` called with next mode, `saveSettings` called with next mode.
2. `cycleTheme(buttonEl)` happy path: `startViewTransition` called, callback invokes `flushSync(applyTheme)`, `documentElement.animate` called with correct clip-path endpoints, `saveSettings` called.
3. `prefers-reduced-motion: reduce` → instant path even with anchor.
4. `startViewTransition` undefined → instant path even with anchor.
5. `resolveEffective` unchanged across cycle step (simulate OS-light + `system → light`) → instant path.
6. Second `cycleTheme(buttonEl)` call while first is in flight → second returns immediately; `startViewTransition` call count stays at 1.
7. After `transition.finished` resolves, a subsequent `cycleTheme(buttonEl)` call proceeds normally (lock released).

### Component tests — `components/__tests__/theme-toggler.test.tsx`

Testing Library + vitest + jsdom. Mock `useTheme` to return a controllable `{ mode, cycleTheme }`.

Cases:
1. Renders `Monitor` icon when `mode === "system"`, `Sun` for `light`, `Moon` for `dark`.
2. Click invokes `cycleTheme` with a non-null `HTMLButtonElement` (the button's own ref).
3. `aria-label` and tooltip content are present and localized (verifies i18n wiring).

View-Transition visuals are not asserted — jsdom does not implement the API, and the animation-call-site assertions in the hook tests give sufficient coverage.

## Open risks

- **TS typings for `startViewTransition`**: if `@types/react-dom` + TS lib config don't ship the type, a local ambient declaration is needed. Low risk; 5 minutes if it comes up.
- **Stacked extension panels**: the ripple animates `<html>`, so it covers the whole tab. In the extension's full-page "tabs" entrypoint this is the expected behavior. Verify visually on the popup and settings entrypoints too — if either uses a nested iframe, ripple scope may look odd (expected to be fine, but worth a manual check).
- **Flicker on transition teardown**: if `flushSync` timing is off, a brief flash of pre-transition paint can appear. Mitigation: the `applyTheme` mutation and `setMode` both run inside the same `flushSync` call, so DOM and React state update atomically before VT captures the new frame.

## Implementation order (build sequence)

1. Extend `useTheme().cycleTheme` to accept `anchor?` and implement the animation orchestration. Update the one existing call site (`workspace-sidebar.tsx`) to pass `null` temporarily to verify nothing breaks.
2. Add hook unit tests; confirm all 7 cases pass.
3. Create `<ThemeToggler />` component.
4. Swap the sidebar inline button for `<ThemeToggler />`.
5. Add component tests.
6. Manual verification: toggle through the cycle with reduced-motion off and on; verify cross-tab propagation (two extension tabs open, click in one, other updates instantly without a ghost ripple).

Each step is independently reviewable and keeps the app in a working state.
