import { Button } from "@opentab/ui/components/button";
import { cn } from "@opentab/ui/lib/utils";
import { Check, Copy, Download, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SyncSetupWizard } from "@/components/settings/sync-setup-wizard";
import { SyncStatusCard } from "@/components/settings/sync-status-card";
import { getBuildString } from "@/lib/build-info";
import { exportAllData } from "@/lib/export";
import { processImportFile } from "@/lib/import/process-file";
import { useLocale } from "@/lib/locale";
import { type AppSettings, getSettings, type Locale, type ThemeMode } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { useSyncAuthState } from "@/lib/use-sync-auth-state";

type SettingsPanel = "general" | "import-export";

const THEME_OPTIONS = [
  { value: "light" as ThemeMode, labelKey: "settings.appearance.theme_light" as const },
  { value: "dark" as ThemeMode, labelKey: "settings.appearance.theme_dark" as const },
  { value: "system" as ThemeMode, labelKey: "settings.appearance.theme_system" as const },
];

const LANGUAGE_OPTIONS = [
  { value: "en" as Locale, native: "English", labelKey: "settings.appearance.lang_en" as const },
  { value: "zh" as Locale, native: "中文", labelKey: "settings.appearance.lang_zh" as const },
];

export default function App() {
  const [activePanel, setActivePanel] = useState<SettingsPanel>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const syncAuth = useSyncAuthState();

  const { mode: themeMode, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  useEffect(() => {
    getSettings().then((loaded) => {
      setSettings(loaded);
    });
  }, []);

  const handleThemeChange = useCallback(
    (theme: ThemeMode) => {
      setSettings((prev) => (prev ? { ...prev, theme } : prev));
      setTheme(theme);
    },
    [setTheme],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportAllData();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        await processImportFile(file, t);
      } catch (err) {
        console.error("Failed to read import file:", err);
        alert(t("settings.import.read_error"));
      }
    };
    input.click();
  }, [t]);

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
        <p className="text-muted-foreground">{t("settings.loading")}</p>
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-1 bg-background text-foreground sm:grid-cols-[200px_1fr]">
      {/* Left nav */}
      <nav className="border-border border-r p-4">
        <h1 className="mb-4 font-semibold text-lg">{t("settings.title")}</h1>
        <div className="space-y-1">
          <button
            type="button"
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-left font-medium text-sm transition-colors",
              activePanel === "import-export"
                ? "bg-accent"
                : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setActivePanel("import-export")}
          >
            {t("settings.nav.import_export")}
          </button>
          <button
            type="button"
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-left font-medium text-sm transition-colors",
              activePanel === "general" ? "bg-accent" : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setActivePanel("general")}
          >
            {t("settings.nav.general")}
          </button>
        </div>
      </nav>

      {/* Right content */}
      <main className="p-8">
        {activePanel === "general" && (
          <>
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
                      onClick={() => handleThemeChange(opt.value)}
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
                {t("settings.server.title")}
              </h3>
              {syncAuth.kind === "authenticated" ? (
                <SyncStatusCard auth={syncAuth} />
              ) : wizardOpen ? (
                <SyncSetupWizard
                  onClose={() => setWizardOpen(false)}
                  onCancel={() => setWizardOpen(false)}
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Sync your workspaces across devices via the OpenTab sync server.
                  </p>
                  <Button size="sm" onClick={() => setWizardOpen(true)}>
                    Enable Sync
                  </Button>
                </div>
              )}

              <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
                {t("settings.about.title")}
              </h3>
              <BuildInfo />
            </section>
          </>
        )}

        {activePanel === "import-export" && (
          <>
            <h2 className="mb-6 font-semibold text-xl">{t("settings.nav.import_export")}</h2>
            <section className="max-w-md space-y-6">
              <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
                {t("settings.export.title")}
              </h3>
              <p className="text-muted-foreground text-sm">{t("settings.export.description")}</p>
              <Button onClick={handleExport} disabled={isExporting} className="gap-2">
                <Upload className="size-4" />
                {isExporting ? t("settings.export.exporting") : t("settings.export.button")}
              </Button>

              <h3 className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
                {t("settings.import.title")}
              </h3>
              <p className="text-muted-foreground text-sm">{t("settings.import.description")}</p>
              <Button variant="outline" onClick={handleImport} className="gap-2">
                <Download className="size-4" />
                {t("settings.import.button")}
              </Button>
            </section>
          </>
        )}
      </main>
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
