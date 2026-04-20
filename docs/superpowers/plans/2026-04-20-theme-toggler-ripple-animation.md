# Theme Toggler Ripple Animation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar's instant theme class-swap with a circular View Transitions ripple anchored at the clicked button, by migrating a small tree of pre-existing components into OpenTab (`Toggle`, `ToggleGroup`, `Sonner` into `@opentab/ui`; `AnimatedThemeToggler`, `ThemeToggler` into the extension app) and adapting them to OpenTab's 3-mode (`system/light/dark`) `useTheme` plus the `radix-ui ^1.4.3` unified primitives package.

**Architecture:** Animation orchestration lives in `useTheme().cycleTheme(anchor?)` — a single place that owns cycle math, effective-color guard, View Transition, clip-path animate, in-flight lock, and persistence. The migrated `<AnimatedThemeToggler>` becomes a thin ref-forwarding `<button>` that calls `cycleTheme(buttonRef.current)`. `<ThemeToggler>` is a 2-variant (`icon` default / `toggle`) component; sidebar wires `type="icon"` inside the existing `<TooltipTrigger asChild>`. Fallbacks (`prefers-reduced-motion`, no `startViewTransition`, effective-color unchanged, no anchor) all short-circuit to the current instant-swap path.

**Tech Stack:** React 19 (refs-as-props), Vitest + jsdom + `@testing-library/react`, Tailwind v4, `radix-ui` unified primitives, `lucide-react` icons, i18next, Dexie (via mocks in tests), Chrome extension MV3 runtime APIs.

---

## File Structure Overview

### New files

| Path | Responsibility |
|---|---|
| `packages/ui/src/components/toggle.tsx` | shadcn `Toggle` primitive (cva variants, Radix `Toggle.Root`). Reused by `toggle-group`. |
| `packages/ui/src/components/toggle-group.tsx` | shadcn `ToggleGroup` + `ToggleGroupItem`, consuming `toggleVariants` from `./toggle.js`. |
| `packages/ui/src/components/sonner.tsx` | Thin wrapper around `sonner` Toaster. Takes `theme` as a prop (no hook). |
| `apps/extension/vitest.setup.ts` | Single-line setup importing Testing Library matchers. |
| `apps/extension/src/components/animated-theme-toggler.tsx` | Ref-forwarding `<button>` that calls `cycleTheme(buttonRef.current)` and renders `ICON[mode]`. |
| `apps/extension/src/components/theme-toggler.tsx` | Variant dispatcher: `type="icon"` → `<AnimatedThemeToggler>`, `type="toggle"` → `<ToggleGroup>` 3-choice. |
| `apps/extension/src/lib/__tests__/theme.test.ts` | Unit tests for `cycleTheme(anchor?)` — 7 scenarios. |
| `apps/extension/src/components/__tests__/theme-toggler.test.tsx` | Render + click tests for `type="icon"`. |

### Modified files

| Path | Change |
|---|---|
| `packages/ui/package.json` | Add `sonner` dep; add 3 new `exports` entries. |
| `apps/extension/package.json` | Add devDeps: `jsdom`, `@testing-library/react@^16`, `@testing-library/jest-dom`, `@testing-library/dom`, `@vitejs/plugin-react`. |
| `apps/extension/vitest.config.ts` | `environment: "jsdom"`, broaden `include` to `.tsx`, add `setupFiles`, wire `plugins: [react()]` for JSX transform. |
| `apps/extension/tsconfig.json` | Widen `include` to cover `vitest.config.ts` + `vitest.setup.ts` so `check-types` sees test config. |
| `apps/extension/src/lib/theme.ts` | `cycleTheme(anchor?)` with animation orchestration + in-flight lock + ambient `Document.startViewTransition` type. |
| `apps/extension/src/components/layout/workspace-sidebar.tsx` | Swap inner Button → `<ThemeToggler type="icon" aria-label={label} />`; remove `THEME_ICON` const, `ThemeIcon` local, `cycleTheme` destructure, `Monitor/Moon/Sun` imports. |

---

## Task 1: Migrate `Toggle` primitive to `@opentab/ui`

**Files:**
- Create: `packages/ui/src/components/toggle.tsx`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Create `packages/ui/src/components/toggle.tsx`**

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils.js";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
```

- [ ] **Step 2: Add export entry to `packages/ui/package.json`**

Add one line inside the `exports` object (after `./components/switch` line):

```json
"./components/toggle": "./src/components/toggle.tsx",
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @opentab/ui check-types
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/toggle.tsx packages/ui/package.json
git commit -m "feat(ui): add Toggle primitive to @opentab/ui"
```

---

## Task 2: Migrate `ToggleGroup` primitive to `@opentab/ui`

**Files:**
- Create: `packages/ui/src/components/toggle-group.tsx`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Create `packages/ui/src/components/toggle-group.tsx`**

```tsx
import type { VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "../lib/utils.js";
import { toggleVariants } from "./toggle.js";

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "default",
});

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
```

- [ ] **Step 2: Add export entry to `packages/ui/package.json`**

```json
"./components/toggle-group": "./src/components/toggle-group.tsx",
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @opentab/ui check-types
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/toggle-group.tsx packages/ui/package.json
git commit -m "feat(ui): add ToggleGroup primitive to @opentab/ui"
```

---

## Task 3: Migrate `Sonner` primitive (adapted) to `@opentab/ui`

**Files:**
- Create: `packages/ui/src/components/sonner.tsx`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Add `sonner` to `packages/ui/package.json` dependencies**

Edit the `dependencies` object — add before `tailwind-merge`:

```json
"sonner": "^2.0.7",
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

Expected: pnpm resolves `sonner ^2.0.7` (already in the workspace graph via `apps/extension`) and wires `@opentab/ui`'s node_modules.

- [ ] **Step 3: Create `packages/ui/src/components/sonner.tsx`**

```tsx
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

- [ ] **Step 4: Add export entry to `packages/ui/package.json`**

```json
"./components/sonner": "./src/components/sonner.tsx",
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @opentab/ui check-types
```

Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/sonner.tsx packages/ui/package.json pnpm-lock.yaml
git commit -m "feat(ui): add Sonner toaster wrapper to @opentab/ui

Strips next-themes; caller passes theme via prop so packages/ui carries
no cross-package hook dependency."
```

---

## Task 4: Set up Vitest jsdom + Testing Library in `apps/extension`

**Files:**
- Modify: `apps/extension/package.json`
- Modify: `apps/extension/vitest.config.ts`
- Create: `apps/extension/vitest.setup.ts`

- [ ] **Step 1: Install test devDeps**

```bash
pnpm add -D -F @opentab/extension jsdom @testing-library/react@^16 @testing-library/jest-dom @testing-library/dom @vitejs/plugin-react
```

Expected: 5 devDependencies appear in `apps/extension/package.json`; `pnpm-lock.yaml` updated. `@vitejs/plugin-react` resolves to `^5` (pinned by root `pnpm.overrides`), which provides the JSX transform vitest needs to execute `.tsx` component tests under React 19's automatic runtime.

- [ ] **Step 2: Update `apps/extension/vitest.config.ts`**

Replace entire file with:

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: Create `apps/extension/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Extend `apps/extension/tsconfig.json` include**

Change line 11 from:

```json
"include": ["src", ".wxt/wxt.d.ts"],
```

to:

```json
"include": ["src", ".wxt/wxt.d.ts", "vitest.config.ts", "vitest.setup.ts"],
```

This makes `check-types` cover the test config too — catches typos in the setup file and future config changes early. Single-line setup has no type surface today, but the broader include costs nothing and prevents the next agent from being confused when config changes don't get checked.

- [ ] **Step 5: Verify existing tests still pass**

```bash
pnpm --filter @opentab/extension test
```

Expected: Existing `collection-sort.test.ts` and `collection-dedup.test.ts` pass (switching to jsdom should not break pure-logic tests). All green.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/package.json apps/extension/vitest.config.ts apps/extension/vitest.setup.ts apps/extension/tsconfig.json pnpm-lock.yaml
git commit -m "chore(extension): enable jsdom + Testing Library in vitest"
```

---

## Task 5: Extend `useTheme().cycleTheme(anchor?)` with animation (TDD)

**Files:**
- Create: `apps/extension/src/lib/__tests__/theme.test.ts`
- Modify: `apps/extension/src/lib/theme.ts`

- [ ] **Step 1: Create the failing test file `apps/extension/src/lib/__tests__/theme.test.ts`**

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  updateSettings: vi.fn().mockResolvedValue(undefined),
}));

const defaultSettings = {
  locale: "en" as const,
  server_enabled: false,
  server_url: "",
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
  sync_polling_interval: 600_000,
};

import { getSettings, saveSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";

function installMocks({
  initialTheme = "light" as "light" | "dark" | "system",
  reducedMotion = false,
  systemDark = false,
  supportsVT = true,
  transitionFinished = Promise.resolve(),
}: {
  initialTheme?: "light" | "dark" | "system";
  reducedMotion?: boolean;
  systemDark?: boolean;
  supportsVT?: boolean;
  transitionFinished?: Promise<void>;
} = {}) {
  vi.mocked(getSettings).mockResolvedValue({ ...defaultSettings, theme: initialTheme });

  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("reduce")
      ? reducedMotion
      : query.includes("dark")
        ? systemDark
        : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;

  document.documentElement.animate = vi.fn() as typeof document.documentElement.animate;

  type DocLike = Document & { startViewTransition?: unknown };
  if (supportsVT) {
    (document as DocLike).startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {
        ready: Promise.resolve(),
        finished: transitionFinished,
        updateCallbackDone: Promise.resolve(),
        skipTransition: vi.fn(),
      };
    });
  } else {
    delete (document as DocLike).startViewTransition;
  }

  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
  });
}

function makeAnchor(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 100,
      width: 24,
      height: 24,
      bottom: 124,
      right: 124,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(btn);
  return btn;
}

afterEach(() => {
  // clearAllMocks wipes call history without restoring module-mock implementations
  // (unlike restoreAllMocks, which can leave `getSettings` returning undefined
  // between tests). unstubAllGlobals rolls back vi.stubGlobal state cleanly.
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
});

describe("useTheme.cycleTheme", () => {
  it("no anchor → instant path (no startViewTransition call)", async () => {
    installMocks({ initialTheme: "light" });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));

    await act(async () => {
      await result.current.cycleTheme();
    });

    expect(
      (document as Document & { startViewTransition?: { mock: unknown } }).startViewTransition,
    ).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("anchor + VT + motion ok + color change → ripple path", async () => {
    installMocks({ initialTheme: "light" });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).toHaveBeenCalledTimes(1);
    expect(document.documentElement.animate).toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("reduced motion → instant path", async () => {
    installMocks({ initialTheme: "light", reducedMotion: true });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).not.toHaveBeenCalled();
  });

  it("no startViewTransition support → instant path", async () => {
    installMocks({ initialTheme: "light", supportsVT: false });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    expect(document.documentElement.animate).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("effective color unchanged → instant path", async () => {
    // system + OS-light → next in cycle is "light" → effective unchanged (light → light)
    installMocks({ initialTheme: "system", systemDark: false });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("system"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).not.toHaveBeenCalled();
  });

  it("in-flight lock: second call while animating is dropped", async () => {
    let resolveFinished!: () => void;
    const finished = new Promise<void>((res) => {
      resolveFinished = res;
    });
    installMocks({ initialTheme: "light", transitionFinished: finished });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    let firstCall!: Promise<void>;
    await act(async () => {
      firstCall = result.current.cycleTheme(anchor);
    });
    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFinished();
      await firstCall;
    });
  });

  it("lock released after transition finished", async () => {
    installMocks({ initialTheme: "light" });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });
    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests; expect 7 failures**

```bash
pnpm --filter @opentab/extension test src/lib/__tests__/theme.test.ts
```

Expected: multiple failures (current `cycleTheme` signature takes no args, has no View Transition logic). Some instant-path tests may pass by coincidence; every animation-path test must fail.

- [ ] **Step 3: Implement the new `apps/extension/src/lib/theme.ts`**

Replace the entire file with:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MSG } from "./constants";
import { getSettings, saveSettings, type ThemeMode } from "./settings";

// Note: TS 5.9+ `lib.dom.d.ts` already declares `Document.startViewTransition`
// (non-optional). The `typeof document.startViewTransition === "function"`
// runtime check below is still needed — Firefox and older Safari don't implement
// the API even though the type exists.

function resolveEffective(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function applyClass(effective: "light" | "dark") {
  document.documentElement.classList.toggle("dark", effective === "dark");
}

export function applyTheme(mode: ThemeMode) {
  applyClass(resolveEffective(mode));
}

const THEME_CYCLE: ThemeMode[] = ["system", "light", "dark"];
const RIPPLE_DURATION_MS = 400;
const RIPPLE_EASING = "ease-out";

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    getSettings().then((s) => {
      setMode(s.theme);
      applyTheme(s.theme);
    });
  }, []);

  useEffect(() => {
    const handler = (message: { type: string }) => {
      if (message.type === MSG.SETTINGS_CHANGED) {
        getSettings().then((s) => {
          setMode(s.theme);
          applyTheme(s.theme);
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyClass(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const cycleTheme = useCallback(
    async (anchor?: HTMLElement | null) => {
      if (isAnimatingRef.current) return;

      const idx = THEME_CYCLE.indexOf(mode);
      const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];

      const supportsVT = typeof document.startViewTransition === "function";
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const shouldAnimate =
        !!anchor &&
        supportsVT &&
        !reducedMotion &&
        resolveEffective(mode) !== resolveEffective(next);

      if (!shouldAnimate) {
        setMode(next);
        applyTheme(next);
        await saveSettings({ theme: next });
        return;
      }

      isAnimatingRef.current = true;
      try {
        // Defensive: if startViewTransition throws synchronously (shouldn't
        // happen in spec-compliant browsers, but matches the spec's fallback
        // matrix), fall back to instant swap. The callback never ran, so
        // apply the mode change here so the finally block's saveSettings
        // persists a mode that's actually visible on screen.
        let transition: ReturnType<Document["startViewTransition"]>;
        try {
          transition = document.startViewTransition(() => {
            flushSync(() => {
              setMode(next);
              applyTheme(next);
            });
          });
        } catch (err) {
          console.warn(
            "document.startViewTransition threw synchronously; falling back to instant swap",
            err,
          );
          setMode(next);
          applyTheme(next);
          return;
        }

        await transition.ready;

        const rect = anchor!.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const maxRad = Math.hypot(
          Math.max(x, window.innerWidth - x),
          Math.max(y, window.innerHeight - y),
        );
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${maxRad}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: RIPPLE_DURATION_MS,
            easing: RIPPLE_EASING,
            pseudoElement: "::view-transition-new(root)",
          },
        );
        await transition.finished;
      } finally {
        isAnimatingRef.current = false;
        await saveSettings({ theme: next });
      }
    },
    [mode],
  );

  const setTheme = useCallback(async (next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
    await saveSettings({ theme: next });
  }, []);

  return { mode, cycleTheme, setTheme };
}
```

- [ ] **Step 4: Run tests; expect all 7 passes**

```bash
pnpm --filter @opentab/extension test src/lib/__tests__/theme.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/lib/theme.ts apps/extension/src/lib/__tests__/theme.test.ts
git commit -m "feat(extension): add anchor + ripple animation to useTheme.cycleTheme"
```

---

## Task 6: Migrate `AnimatedThemeToggler` component

**Files:**
- Create: `apps/extension/src/components/animated-theme-toggler.tsx`

- [ ] **Step 1: Create `apps/extension/src/components/animated-theme-toggler.tsx`**

```tsx
import { Monitor, Moon, Sun } from "lucide-react";
import { type ButtonHTMLAttributes, type MouseEvent, type Ref, useRef } from "react";
import { cn } from "@opentab/ui/lib/utils";
import { useTheme } from "@/lib/theme";

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
};

export function AnimatedThemeToggler({ ref, className, onClick, ...rest }: Props) {
  const { mode, cycleTheme } = useTheme();
  const internalRef = useRef<HTMLButtonElement>(null);

  const mergedRef = (el: HTMLButtonElement | null) => {
    internalRef.current = el;
    if (typeof ref === "function") {
      ref(el);
    } else if (ref) {
      (ref as { current: HTMLButtonElement | null }).current = el;
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    void cycleTheme(internalRef.current);
  };

  const Icon = ICON[mode];

  return (
    <button
      ref={mergedRef}
      type="button"
      onClick={handleClick}
      className={cn(className)}
      {...rest}
    >
      <Icon className="size-4" />
    </button>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint
```

Expected: both exit 0. No new unused-import warnings.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/components/animated-theme-toggler.tsx
git commit -m "feat(extension): add AnimatedThemeToggler (ref-forwarding ripple button)"
```

---

## Task 7: Migrate `ThemeToggler` component

**Files:**
- Create: `apps/extension/src/components/theme-toggler.tsx`

- [ ] **Step 1: Create `apps/extension/src/components/theme-toggler.tsx`**

```tsx
import { ToggleGroup, ToggleGroupItem } from "@opentab/ui/components/toggle-group";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import { useTranslation } from "react-i18next";
import type { ThemeMode } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { AnimatedThemeToggler } from "./animated-theme-toggler";

const THEME_VALUES = ["system", "light", "dark"] as const satisfies readonly ThemeMode[];

function isThemeMode(value: string): value is ThemeMode {
  return (THEME_VALUES as readonly string[]).includes(value);
}

// Omit HTML's button `type` so our discriminator ("icon" | "toggle") doesn't
// collapse to `undefined` via intersection with `"submit" | "reset" | "button"`.
// The underlying <button> in AnimatedThemeToggler hardcodes `type="button"` anyway.
type IconProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  type?: "icon";
  ref?: Ref<HTMLButtonElement>;
};

type ToggleProps = {
  type: "toggle";
  className?: string;
};

export function ThemeToggler(props: IconProps | ToggleProps) {
  const { mode, setTheme } = useTheme();
  const { t } = useTranslation();

  if (props.type === "toggle") {
    const handleValueChange = (value: string) => {
      if (isThemeMode(value)) {
        void setTheme(value);
      }
    };
    const label = (m: ThemeMode) => t("sidebar.theme_label", { mode: t(`sidebar.theme_${m}`) });
    return (
      <ToggleGroup
        type="single"
        className={props.className}
        value={mode}
        onValueChange={handleValueChange}
        variant="outline"
      >
        <ToggleGroupItem value="light" aria-label={label("light")}>
          <Sun />
        </ToggleGroupItem>
        <ToggleGroupItem value="dark" aria-label={label("dark")}>
          <Moon />
        </ToggleGroupItem>
        <ToggleGroupItem value="system" aria-label={label("system")}>
          <Monitor />
        </ToggleGroupItem>
      </ToggleGroup>
    );
  }

  const { type: _type, ...rest } = props;
  return <AnimatedThemeToggler {...rest} />;
}
```

- [ ] **Step 2: Type-check + lint**

```bash
pnpm --filter @opentab/extension check-types && pnpm --filter @opentab/extension lint
```

Expected: both exit 0. If lint flags `_type` unused, confirm Biome's unused-variable rule ignores leading-underscore names (Biome does by default); if not, replace with `const { type, ...rest } = props; void type;` pattern.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/components/theme-toggler.tsx
git commit -m "feat(extension): add ThemeToggler with icon and toggle variants"
```

---

## Task 8: Wire `<ThemeToggler type="icon" />` into sidebar + remove dead code

**Files:**
- Modify: `apps/extension/src/components/layout/workspace-sidebar.tsx`

- [ ] **Step 1: Update the `lucide-react` import to drop theme icons**

Change the import block at `workspace-sidebar.tsx:7-17` from:

```tsx
import {
  ChevronLeft,
  Download,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Settings,
  Sun,
  Upload,
} from "lucide-react";
```

to:

```tsx
import { ChevronLeft, Download, PanelLeft, Plus, Settings, Upload } from "lucide-react";
```

- [ ] **Step 2: Add the `ThemeToggler` import**

After the existing `@/components/workspace/*` imports (around `workspace-sidebar.tsx:24`), add:

```tsx
import { ThemeToggler } from "@/components/theme-toggler";
```

- [ ] **Step 3: Remove the `THEME_ICON` const and the `ThemeIcon` local**

Delete line 33 (`const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;`).

Delete line 105 (`const ThemeIcon = THEME_ICON[mode];`).

- [ ] **Step 4: Drop `cycleTheme` from the destructure**

Change line 100 from:

```tsx
const { mode, cycleTheme } = useTheme();
```

to:

```tsx
const { mode } = useTheme();
```

- [ ] **Step 5: Swap the inner Button for `<ThemeToggler type="icon" ... />`**

Replace lines 282-289 (the `<Button variant="ghost" size="icon-xs" onClick={cycleTheme} ...><ThemeIcon .../></Button>` block) with:

```tsx
<ThemeToggler
  type="icon"
  className="inline-flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground [&_svg]:text-sidebar-foreground/70"
  aria-label={t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) })}
/>
```

Keep the surrounding `<Tooltip><TooltipTrigger asChild>…<TooltipContent>…</TooltipContent></Tooltip>` untouched. `TooltipTrigger asChild` attaches to the button rendered inside `<ThemeToggler>` via the forwarded ref and `...rest` props.

- [ ] **Step 6: Verify lint + types**

```bash
pnpm --filter @opentab/extension lint && pnpm --filter @opentab/extension check-types
```

Expected: both exit 0. Biome's `noUnusedImports` / `noUnusedVariables` default severity is `warn`, so lint will exit 0 even if a cleanup item is missed — treat the lint output as a **warning signal**, not a hard gate. Visually scan the Biome output: if it reports any new warnings mentioning `Monitor`, `Moon`, `Sun`, `THEME_ICON`, `ThemeIcon`, or `cycleTheme`, re-check steps 1-5 above. `check-types` **is** a hard gate — it must exit 0 with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat(extension): wire ThemeToggler into sidebar; remove dead theme-icon code"
```

---

## Task 9: Component tests for `<ThemeToggler type="icon">`

**Files:**
- Create: `apps/extension/src/components/__tests__/theme-toggler.test.tsx`

- [ ] **Step 1: Create `apps/extension/src/components/__tests__/theme-toggler.test.tsx`**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import type { SVGProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockCycleTheme = vi.fn();
const mockSetTheme = vi.fn();
let currentMode: "system" | "light" | "dark" = "system";

vi.mock("@/lib/theme", () => ({
  useTheme: () => ({
    mode: currentMode,
    cycleTheme: mockCycleTheme,
    setTheme: mockSetTheme,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars?.mode ? `${key}:${vars.mode}` : key,
  }),
}));

vi.mock("lucide-react", () => ({
  Monitor: (props: SVGProps<SVGSVGElement>) => <svg data-icon="monitor" {...props} />,
  Sun: (props: SVGProps<SVGSVGElement>) => <svg data-icon="sun" {...props} />,
  Moon: (props: SVGProps<SVGSVGElement>) => <svg data-icon="moon" {...props} />,
}));

import { ThemeToggler } from "@/components/theme-toggler";

afterEach(() => {
  mockCycleTheme.mockClear();
  mockSetTheme.mockClear();
  currentMode = "system";
});

describe('<ThemeToggler type="icon">', () => {
  it("renders the Monitor icon when mode is system", () => {
    currentMode = "system";
    const { container } = render(<ThemeToggler />);
    expect(container.querySelector('[data-icon="monitor"]')).not.toBeNull();
  });

  it("renders the Sun icon when mode is light", () => {
    currentMode = "light";
    const { container } = render(<ThemeToggler />);
    expect(container.querySelector('[data-icon="sun"]')).not.toBeNull();
  });

  it("renders the Moon icon when mode is dark", () => {
    currentMode = "dark";
    const { container } = render(<ThemeToggler />);
    expect(container.querySelector('[data-icon="moon"]')).not.toBeNull();
  });

  it("click invokes cycleTheme with the button element", () => {
    const { container } = render(<ThemeToggler />);
    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    fireEvent.click(btn as HTMLButtonElement);
    expect(mockCycleTheme).toHaveBeenCalledTimes(1);
    expect(mockCycleTheme).toHaveBeenCalledWith(btn);
  });

  it("forwards aria-label prop to the root button", () => {
    render(<ThemeToggler aria-label="Toggle theme" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Toggle theme");
  });
});
```

- [ ] **Step 2: Run the test file**

```bash
pnpm --filter @opentab/extension test src/components/__tests__/theme-toggler.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 3: Run the full extension test suite**

```bash
pnpm --filter @opentab/extension test
```

Expected: all tests pass (collection-sort + collection-dedup + theme + theme-toggler).

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/components/__tests__/theme-toggler.test.tsx
git commit -m "test(extension): add render/click tests for ThemeToggler type=icon"
```

---

## Task 10: Final verification

- [ ] **Step 1: Repository-wide type-check and lint**

```bash
pnpm lint
```

Expected: exits 0.

- [ ] **Step 2: Build the extension**

```bash
pnpm --filter @opentab/extension build
```

Expected: exits 0, output written to `apps/extension/.output/chrome-mv3/`.

- [ ] **Step 3: Load unpacked in Chrome**

Follow these manual steps; there is no automated substitute:

1. Open `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select `apps/extension/.output/chrome-mv3/`.
4. Open the extension's tabs page (new tab replaces).

- [ ] **Step 4: Manual behavior verification**

Confirm each of these:

| Check | Expected |
|---|---|
| Hover the sidebar theme button | Tooltip appears with the localized label (matches current behavior). |
| Click it (mode = system, OS = light) | No ripple (effective color unchanged). Mode advances to `light`; icon switches to Sun. |
| Click again (mode = light → dark) | Ripple expands from the button center; page ends in dark mode; icon switches to Moon. |
| Click again (mode = dark → system, OS = light) | Ripple plays (dark → light effective change); icon returns to Monitor. |
| OS: enable "Reduce motion" → click | No ripple; instant swap. |
| Open two extension tabs → click in one | Other tab's theme updates without any visible ripple (no anchor on that tab). |
| Open settings page → pick theme radio | Instant swap (unchanged behavior). No ripple in settings. |

- [ ] **Step 5: If any manual check fails**

Stop. Do not merge. File findings inline in the failing task's section above and fix at the appropriate task level before re-running the sequence.

---

## Self-Review

- **Spec coverage:** Every committed spec section has a task:
  - Migration Scope (5 files + sonner dep) → Tasks 1-3, 6, 7.
  - `packages/ui` exports → Tasks 1-3.
  - Mechanical adaptations (paths, radix-ui unified, i18n aria-label, next-themes strip from sonner) → inline in Tasks 1-3, 6, 7.
  - Runtime adaptations (useTheme rename, sonner theme-prop, AnimatedThemeToggler 2→3 state + ref forwarding, `type="button"` drop, `isThemeMode` narrow) → Tasks 3, 6, 7.
  - Wiring (sidebar swap + outer Tooltip retention + dead code cleanup) → Task 8.
  - Hook change (`cycleTheme(anchor?)` + ambient VT type + lock + 400ms ease-out + fallbacks) → Task 5.
  - Test infra (jsdom, Testing Library, vitest include/setup) → Task 4 (before Task 5).
  - Tests (hook 7 cases, component 5 cases — expands spec's 3 conceptual cases by splitting "renders correct icon for each mode" into 3 explicit per-mode tests) → Tasks 5 and 9.
  - Manual verification → Task 10.

- **Placeholder scan:** No TODO / TBD / "fill in details" / vague "add error handling" remains; all code blocks are complete.

- **Type consistency:** `ThemeMode`, `THEME_CYCLE` / `THEME_VALUES`, `cycleTheme(anchor?: HTMLElement | null) => Promise<void>`, `setTheme(next: ThemeMode) => Promise<void>`, `ICON[mode]` map all match across theme.ts, AnimatedThemeToggler, and ThemeToggler. Hook returns `{ mode, cycleTheme, setTheme }` consistently.
