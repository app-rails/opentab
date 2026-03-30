import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { checkHealth } from "@/lib/api";
import { MSG } from "@/lib/constants";
import { type AppSettings, getSettings, updateSettings } from "@/lib/settings";

type ConnectionStatus = "not_enabled" | "testing" | "connected" | "disconnected";

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("not_enabled");

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const saveAndNotify = useCallback(async (partial: Partial<AppSettings>) => {
    await updateSettings(partial);
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, []);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setSettings((prev) => (prev ? { ...prev, server_enabled: enabled } : prev));
      setConnectionStatus(enabled ? "disconnected" : "not_enabled");
      await saveAndNotify({ server_enabled: enabled });
    },
    [saveAndNotify],
  );

  const handleUrlChange = useCallback(
    async (url: string) => {
      setSettings((prev) => (prev ? { ...prev, server_url: url } : prev));
      await saveAndNotify({ server_url: url });
    },
    [saveAndNotify],
  );

  const handleTestConnection = useCallback(async () => {
    if (!settings) return;
    setConnectionStatus("testing");
    const ok = await checkHealth(settings.server_url);
    setConnectionStatus(ok ? "connected" : "disconnected");
  }, [settings]);

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-[200px_1fr] bg-background text-foreground">
      {/* Left nav */}
      <nav className="border-r border-border p-4">
        <h1 className="mb-4 text-lg font-semibold">Settings</h1>
        <div className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium">General</div>
      </nav>

      {/* Right content */}
      <main className="p-8">
        <h2 className="mb-6 text-xl font-semibold">General</h2>

        <section className="max-w-md space-y-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Server Sync
          </h3>

          {/* Toggle */}
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

          {/* URL + Test + Status (only when enabled) */}
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

          {/* Status when not enabled */}
          {!settings.server_enabled && <StatusIndicator status="not_enabled" />}
        </section>
      </main>
    </div>
  );
}

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    not_enabled: { color: "bg-muted-foreground/40", text: "Not enabled" },
    testing: { color: "bg-yellow-500", text: "Testing..." },
    connected: { color: "bg-green-500", text: "Connected" },
    disconnected: { color: "bg-red-500", text: "Disconnected" },
  }[status];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`size-2 rounded-full ${config.color}`} />
      {config.text}
    </div>
  );
}
