import { Download, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { checkHealth } from "@/lib/api";
import { db } from "@/lib/db";
import { exportAllData } from "@/lib/export";
import { detectFormat } from "@/lib/import/detect";
import { parseOpenTab } from "@/lib/import/parse-opentab";
import { parseTabTab } from "@/lib/import/parse-tabtab";
import { type AppSettings, getSettings, saveSettings, type ThemeMode } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SettingsPanel = "general" | "import-export";
type ConnectionStatus = "not_enabled" | "testing" | "connected" | "disconnected";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
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
          alert("Unsupported file format. Please select a TabTab or OpenTab JSON file.");
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
        alert("Failed to read file. Please ensure it is a valid JSON file.");
      }
    };
    input.click();
  }, []);

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-1 sm:grid-cols-[200px_1fr] bg-background text-foreground">
      {/* Left nav */}
      <nav className="border-r border-border p-4">
        <h1 className="mb-4 text-lg font-semibold">Settings</h1>
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
            Import / Export
          </button>
          <button
            type="button"
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
              activePanel === "general" ? "bg-accent" : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setActivePanel("general")}
          >
            General
          </button>
        </div>
      </nav>

      {/* Right content */}
      <main className="p-8">
        {activePanel === "general" && (
          <>
            <h2 className="mb-6 text-xl font-semibold">General</h2>
            <section className="max-w-md space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Appearance
              </h3>
              <div className="space-y-2">
                <span className="text-sm font-medium">Theme</span>
                <div
                  className="flex gap-1 rounded-lg border border-border p-1"
                  role="radiogroup"
                  aria-label="Theme"
                >
                  {THEME_OPTIONS.map((opt) => (
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
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Server Sync
              </h3>
              <div className="flex items-center justify-between">
                <label htmlFor="server-sync" className="text-sm font-medium">
                  Enable Server Sync
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
                      Server URL
                    </label>
                    <Input
                      id="server-url"
                      value={settings.server_url}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="http://localhost:3001"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={connectionStatus === "testing"}
                    >
                      {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
                    </Button>
                    <StatusIndicator status={connectionStatus} />
                  </div>
                </>
              )}
              {!settings.server_enabled && <StatusIndicator status="not_enabled" />}
            </section>
          </>
        )}

        {activePanel === "import-export" && (
          <>
            <h2 className="mb-6 text-xl font-semibold">Import / Export</h2>
            <section className="max-w-md space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Export
              </h3>
              <p className="text-sm text-muted-foreground">
                Export all your workspaces, collections, and tabs as a JSON file.
              </p>
              <Button onClick={handleExport} disabled={isExporting} className="gap-2">
                <Download className="size-4" />
                {isExporting ? "Exporting..." : "Export All Data"}
              </Button>

              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Import
              </h3>
              <p className="text-sm text-muted-foreground">
                Import data from a TabTab or OpenTab JSON backup file. You'll be able to preview and
                select what to import before any changes are made.
              </p>
              <Button variant="outline" onClick={handleImport} className="gap-2">
                <Upload className="size-4" />
                Import Data
              </Button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    not_enabled: { color: "bg-muted-foreground/40", text: "Not enabled" },
    testing: { color: "bg-[var(--status-yellow)]", text: "Testing..." },
    connected: { color: "bg-[var(--status-green)]", text: "Connected" },
    disconnected: { color: "bg-[var(--status-red)]", text: "Disconnected" },
  }[status];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`size-2 rounded-full ${config.color}`} />
      {config.text}
    </div>
  );
}
