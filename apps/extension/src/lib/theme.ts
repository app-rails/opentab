import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MSG } from "./constants";
import { getSettings, saveSettings, type ThemeMode } from "./settings";

// Runtime check still needed: Firefox and older Safari lack startViewTransition.

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
        // Defensive fallback for sync throw: callback never ran, so apply inline.
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
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRad}px at ${x}px ${y}px)`],
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

  const setTheme = useCallback(
    async (next: ThemeMode) => {
      if (next === mode) return;
      setMode(next);
      applyTheme(next);
      await saveSettings({ theme: next });
    },
    [mode],
  );

  return { mode, cycleTheme, setTheme };
}
