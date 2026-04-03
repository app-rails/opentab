import { useCallback, useEffect, useState } from "react";
import i18n from "i18next";
import { MSG } from "./constants";
import { getSettings, saveSettings, type Locale } from "./settings";

const LOCALE_CYCLE: Locale[] = ["en", "zh"];

export function useLocale() {
  // initLocale() guarantees i18n.language is correct before React renders,
  // so we read it synchronously here. No mount effect needed.
  const [locale, setLocaleState] = useState<Locale>((i18n.language as Locale) || "en");

  // Listen for cross-tab changes (when another tab changes locale)
  useEffect(() => {
    const handler = (message: { type: string }) => {
      if (message.type === MSG.SETTINGS_CHANGED) {
        getSettings().then((s) => {
          setLocaleState(s.locale);
          i18n.changeLanguage(s.locale);
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await i18n.changeLanguage(next);
    await saveSettings({ locale: next });
  }, []);

  const cycleLocale = useCallback(async () => {
    const idx = LOCALE_CYCLE.indexOf(locale);
    const next = LOCALE_CYCLE[(idx + 1) % LOCALE_CYCLE.length];
    setLocaleState(next);
    await i18n.changeLanguage(next);
    await saveSettings({ locale: next });
  }, [locale]);

  return { locale, setLocale, cycleLocale };
}
