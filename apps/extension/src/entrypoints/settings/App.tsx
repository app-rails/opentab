import { Button } from "@opentab/ui/components/button";
import { Input } from "@opentab/ui/components/input";
import { Switch } from "@opentab/ui/components/switch";
import { cn } from "@opentab/ui/lib/utils";
import { Check, Copy, Download, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { checkHealth } from "@/lib/api";
import { getBuildString } from "@/lib/build-info";
import { db } from "@/lib/db";
import { exportAllData } from "@/lib/export";
import { detectFormat } from "@/lib/import/detect";
import { parseOpenTab } from "@/lib/import/parse-opentab";
import { parseTabTab } from "@/lib/import/parse-tabtab";
import { useLocale } from "@/lib/locale";
import {
  type AppSettings,
  getSettings,
  type Locale,
  saveSettings,
  type ThemeMode,
} from "@/lib/settings";
import { useTheme } from "@/lib/theme";

type SettingsPanel = "general" | "import-export";
type ConnectionStatus = "not_enabled" | "testing" | "connected" | "disconnected";

const THEME_OPTIONS = [
  { value: "light" as ThemeMode, labelKey: "settings.appearance.theme_light" as const },
  { value: "dark" as ThemeMode, labelKey: "settings.appearance.theme_dark" as const },
  { value: "system" as ThemeMode, labelKey: "settings.appearance.theme_system" as const },
];

const LANGUAGE_OPTIONS = [
  { value: "en" as Locale, native: "English", labelKey: "settings.appearance.lang_en" as const },
  { value: "zh" as Locale, native: "中文", labelKey: "settings.appearance.lang_zh" as const },
];

function useDebouncedSave(delayMs: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  return useCallback(
    (partial: Partial<AppSettings>) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void saveSettings(partial).catch((error) => {
          console.error("Failed to save settings:", error);
        });
      }, delayMs);
    },
    [delayMs],
  );
}

export default function App() {
  const [activePanel, setActivePanel] = useState<SettingsPanel>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("not_enabled");
  const [isExporting, setIsExporting] = useState(false);
  const debouncedSave = useDebouncedSave(500);

  const { mode: themeMode, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  useEffect(() => {
    getSettings().then((loaded) => {
      setSettings(loaded);
      setConnectionStatus(loaded.server_enabled ? "disconnected" : "not_enabled");
    });
  }, []);

  const handleToggle = useCallback(async (enabled: boolean) => {
    setSettings((prev) => (prev ? { ...prev, server_enabled: enabled } : prev));
    setConnectionStatus(enabled ? "disconnected" : "not_enabled");
    await saveSettings({ server_enabled: enabled });
  }, []);

  const handleUrlChange = useCallback(
    (url: string) => {
      setSettings((prev) => (prev ? { ...prev, server_url: url } : prev));
      setConnectionStatus("disconnected");
      debouncedSave({ server_url: url });
    },
    [debouncedSave],
  );

  const handleTestConnection = useCallback(async () => {
    if (!settings) return;
    setConnectionStatus("testing");
    const ok = await checkHealth(settings.server_url);
    setConnectionStatus(ok ? "connected" : "disconnected");
  }, [settings]);

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
        const text = await file.text();
        const json = JSON.parse(text);
        const format = detectFormat(json);

        if (!format) {
          alert(t("settings.import.unsupported_format"));
          return;
        }

        const importData = format === "tabtab" ? parseTabTab(json) : parseOpenTab(json);

        const sessionId = await db.importSessions.add({
          data: JSON.stringify(importData),
          createdAt: Date.now(),
        });

        chrome.tabs.create({
          url: chrome.runtime.getURL(`/import.html?sessionId=${sessionId}`),
        });
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
    <div className="grid h-screen grid-cols-1 sm:grid-cols-[200px_1fr] bg-background text-foreground">
      {/* Left nav */}
      <nav className="border-r border-border p-4">
        <h1 className="mb-4 text-lg font-semibold">{t("settings.title")}</h1>
        <div className="space-y-1">
          <button
            type="button"
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
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
              "w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
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
            <h2 className="mb-6 text-xl font-semibold">{t("settings.nav.general")}</h2>
            <section className="max-w-md space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {t("settings.appearance.title")}
              </h3>
              <div className="space-y-2">
                <span className="text-sm font-medium">{t("settings.appearance.theme")}</span>
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
                        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
                <span className="text-sm font-medium">{t("settings.appearance.language")}</span>
                <div className="rounded-lg border border-border">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-accent first:rounded-t-lg last:rounded-b-lg [&:not(:last-child)]:border-b border-border"
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

              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {t("settings.server.title")}
              </h3>
              <div className="flex items-center justify-between">
                <label htmlFor="server-sync" className="text-sm font-medium">
                  {t("settings.server.enable")}
                </label>
                <Switch
                  id="server-sync"
                  checked={settings.server_enabled}
                  onCheckedChange={handleToggle}
                />
              </div>
              {settings.server_enabled && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="server-url" className="text-sm font-medium">
                      {t("settings.server.url_label")}
                    </label>
                    <Input
                      id="server-url"
                      value={settings.server_url}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder={t("settings.server.url_placeholder")}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={connectionStatus === "testing"}
                    >
                      {connectionStatus === "testing"
                        ? t("settings.server.testing")
                        : t("settings.server.test")}
                    </Button>
                    <StatusIndicator status={connectionStatus} />
                  </div>
                </>
              )}
              {!settings.server_enabled && <StatusIndicator status="not_enabled" />}

              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {t("settings.about.title")}
              </h3>
              <BuildInfo />
            </section>
          </>
        )}

        {activePanel === "import-export" && (
          <>
            <h2 className="mb-6 text-xl font-semibold">{t("settings.nav.import_export")}</h2>
            <section className="max-w-md space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {t("settings.export.title")}
              </h3>
              <p className="text-sm text-muted-foreground">{t("settings.export.description")}</p>
              <Button onClick={handleExport} disabled={isExporting} className="gap-2">
                <Download className="size-4" />
                {isExporting ? t("settings.export.exporting") : t("settings.export.button")}
              </Button>

              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {t("settings.import.title")}
              </h3>
              <p className="text-sm text-muted-foreground">{t("settings.import.description")}</p>
              <Button variant="outline" onClick={handleImport} className="gap-2">
                <Upload className="size-4" />
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
      <span className="text-sm text-muted-foreground">{buildString}</span>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={handleCopy}
        aria-label={t("settings.about.copy")}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      {copied && (
        <span className="text-xs text-muted-foreground">{t("settings.about.copied")}</span>
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  const config = {
    not_enabled: { color: "bg-muted-foreground/40", text: t("settings.server.status.not_enabled") },
    testing: { color: "bg-[var(--status-yellow)]", text: t("settings.server.status.testing") },
    connected: { color: "bg-[var(--status-green)]", text: t("settings.server.status.connected") },
    disconnected: {
      color: "bg-[var(--status-red)]",
      text: t("settings.server.status.disconnected"),
    },
  }[status];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`size-2 rounded-full ${config.color}`} />
      {config.text}
    </div>
  );
}
