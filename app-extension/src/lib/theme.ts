import { useCallback, useEffect, useState } from "react";
import { MSG } from "./constants";
import { getSettings, type ThemeMode, updateSettings } from "./settings";

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

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");

  // Load on mount
  useEffect(() => {
    getSettings().then((s) => {
      setMode(s.theme);
      applyTheme(s.theme);
    });
  }, []);

  // Listen for cross-tab changes
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

  // Watch system preference when mode is "system"
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyClass(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  // Apply whenever mode changes
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const cycleTheme = useCallback(async () => {
    const idx = THEME_CYCLE.indexOf(mode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setMode(next);
    applyTheme(next);
    await updateSettings({ theme: next });
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, [mode]);

  const setTheme = useCallback(async (next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
    await updateSettings({ theme: next });
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, []);

  return { mode, cycleTheme, setTheme };
}
