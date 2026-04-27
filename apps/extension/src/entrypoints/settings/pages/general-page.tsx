import { cn } from "@opentab/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { getBuildString } from "@/lib/build-info";
import { useLocale } from "@/lib/locale";
import type { Locale, ThemeMode } from "@/lib/settings";
import { useTheme } from "@/lib/theme";

const THEME_OPTIONS = [
  { value: "light" as ThemeMode, labelKey: "settings.appearance.theme_light" as const },
  { value: "dark" as ThemeMode, labelKey: "settings.appearance.theme_dark" as const },
  { value: "system" as ThemeMode, labelKey: "settings.appearance.theme_system" as const },
];

const LANGUAGE_OPTIONS = [
  { value: "en" as Locale, native: "English", labelKey: "settings.appearance.lang_en" as const },
  { value: "zh" as Locale, native: "中文", labelKey: "settings.appearance.lang_zh" as const },
];

export function GeneralPage() {
  const { mode: themeMode, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  return (
    <div className="p-8">
      <h2 className="mb-6 font-semibold text-xl">{t("settings.nav.general")}</h2>
      <section className="max-w-md space-y-6">
        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
          {t("settings.appearance.title")}
        </h3>
        <div className="space-y-2">
          <span className="font-medium text-sm">{t("settings.appearance.theme")}</span>
          <div
            className="flex gap-1 rounded-lg border border-border p-1"
            role="radiogroup"
            aria-label={t("settings.appearance.theme")}
          >
            {THEME_OPTIONS.map((opt) => (
              // biome-ignore lint/a11y/useSemanticElements: styled radio group using button+role is intentional
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={themeMode === opt.value}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                  themeMode === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => setTheme(opt.value)}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="font-medium text-sm">{t("settings.appearance.language")}</span>
          <div className="rounded-lg border border-border">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="flex w-full items-center justify-between border-border px-3 py-2.5 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent [&:not(:last-child)]:border-b"
                onClick={() => setLocale(opt.value)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{opt.native}</span>
                  {locale !== opt.value && (
                    <span className="text-muted-foreground">{t(opt.labelKey)}</span>
                  )}
                </div>
                {locale === opt.value && <span className="text-primary">✓</span>}
              </button>
            ))}
          </div>
        </div>

        <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
          {t("settings.about.title")}
        </h3>
        <BuildInfo />
      </section>
    </div>
  );
}

function BuildInfo() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const buildString = getBuildString();

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(buildString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildString]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm">{buildString}</span>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={handleCopy}
        aria-label={t("settings.about.copy")}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      {copied && (
        <span className="text-muted-foreground text-xs">{t("settings.about.copied")}</span>
      )}
    </div>
  );
}
