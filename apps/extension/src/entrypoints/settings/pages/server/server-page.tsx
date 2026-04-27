import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { MSG } from "@/lib/constants";
import { db } from "@/lib/db";
import { type SyncSettings, setSyncSettings } from "@/lib/sync-settings";
import { useSyncSettings } from "@/lib/use-sync-settings";
import { ServerEmpty } from "./server-empty";
import { ServerHero } from "./server-hero";
import { ServerInfoCard } from "./server-info-card";
import { ServerPaused } from "./server-paused";
import { ServerReauthBanner } from "./server-reauth-banner";
import { ServerStatsCards } from "./server-stats-cards";
import { ServerSyncLog } from "./server-sync-log";

/**
 * `/server` route — pure state dispatcher.
 *
 *   useSyncSettings() shape          →  branch
 *   ────────────────────────────────────────────────────────
 *   !enabled && !savedConfig         →  <ServerEmpty>          (first run)
 *   !enabled &&  savedConfig         →  <ServerPaused>         (toggle off, data kept)
 *    enabled && !auth                →  <ServerWizard>         (T25–T28, placeholder for now)
 *    enabled &&  auth                →  <ServerConnected>      (T17–T24, real impl)
 *
 * The four branches are mutually exclusive given the SyncSettings shape, so
 * the chain of `return`s is exhaustive without needing a final fallback.
 */
export function ServerPage() {
  const settings = useSyncSettings();
  // Local-only dismiss for the reauth banner. Defaults to "show" each mount
  // — `useState`'s initial value runs once per component instance, so a
  // dismissed banner re-appears the next time the user navigates away and
  // back. Persisting dismissal across mounts would risk hiding a real
  // expired-auth situation forever.
  const [reauthDismissed, setReauthDismissed] = useState(false);

  if (!settings.enabled && !settings.savedConfig) {
    return <ServerEmpty />;
  }
  if (!settings.enabled && settings.savedConfig) {
    return <ServerPaused config={settings.savedConfig} />;
  }
  if (settings.enabled && !settings.auth) {
    // savedConfig present + auth missing = reauth path (engine just cleared
    // auth on a runtime 401/403). savedConfig absent = first-run wizard,
    // banner would be confusing — only render it when there's prior config
    // to explain "why am I back in the wizard?".
    const showReauthBanner = settings.savedConfig != null && !reauthDismissed;
    return (
      <div className="space-y-4">
        {showReauthBanner ? (
          <div className="mx-auto max-w-3xl px-8 pt-10">
            <ServerReauthBanner
              onReauth={() => setReauthDismissed(false)}
              onDismiss={() => setReauthDismissed(true)}
            />
          </div>
        ) : null}
        <ServerWizardPlaceholder />
      </div>
    );
  }
  return (
    <ServerConnected
      savedConfig={settings.savedConfig!}
      auth={settings.auth!}
      hostHistory={settings.hostHistory}
    />
  );
}

// Inline placeholder for T25–T28 (wizard). Keeps the dispatcher exhaustive
// and lets the sidebar / routes tests assert routing against a stable testid
// while the real wizard is still under construction.
function ServerWizardPlaceholder() {
  return <div data-testid="server-wizard-placeholder">WIZARD WIP</div>;
}

interface ServerConnectedProps {
  savedConfig: NonNullable<SyncSettings["savedConfig"]>;
  auth: NonNullable<SyncSettings["auth"]>;
  hostHistory: SyncSettings["hostHistory"];
}

/**
 * Connected state — assembles the four panels (hero, info, stats, log) and
 * owns the side-effects each callback needs:
 *
 *   action            wiring
 *   ─────────────────────────────────────────────────────────────────────
 *   switch off     →  setSyncSettings({ enabled: false })
 *                     (auth + savedConfig retained → drops to <ServerPaused>)
 *   sync now       →  chrome.runtime.sendMessage(SYNC_REQUEST) fire-and-forget
 *   forget server  →  setSyncSettings({ enabled:false, savedConfig:null,
 *                                       auth:null, hostHistory:filtered })
 *                     TODO(T31): swap for a confirm modal before clearing.
 *   reconfigure    →  no-op TODO; T31 wires the wizard re-entry.
 *   copy device id →  navigator.clipboard.writeText(auth.deviceId)
 *
 * lastSyncAt comes from db.syncMeta (engine writes it on every successful
 * sync; same source SyncStatusCard reads).
 */
function ServerConnected({ savedConfig, auth, hostHistory }: ServerConnectedProps) {
  // useLiveQuery so the "last synced N min ago" surface refreshes whenever
  // the engine bumps the row — no manual polling needed.
  const lastSyncAt =
    useLiveQuery(async () => {
      const meta = await db.syncMeta.get("lastSyncAt");
      return typeof meta?.value === "number" ? meta.value : null;
    }, []) ?? null;

  const handleSwitchChange = useCallback((enabled: boolean) => {
    if (enabled) return; // already on; no-op (real ON path is wizard, not here)
    void setSyncSettings({ enabled: false });
  }, []);

  const handleSyncNow = useCallback(() => {
    // Fire-and-forget: bg's onMessage handler triggers syncEngine.sync().
    // The error swallow guards against a missing listener (e.g. service
    // worker idle in tests) so we don't surface a meaningless error toast.
    chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {
      // intentionally ignored — see comment above
    });
  }, []);

  const handleForgetServer = useCallback(() => {
    // TODO(T31): replace with a confirm modal. For now we clear immediately
    // so the action is at least functional; hostHistory keeps everything
    // *except* the forgotten host so re-config can still surface other servers.
    const filteredHistory = hostHistory.filter((entry) => entry.host !== savedConfig.host);
    void setSyncSettings({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: filteredHistory,
    });
  }, [hostHistory, savedConfig.host]);

  const handleReconfigure = useCallback(() => {
    // TODO(T31): wire the wizard re-entry path (route + state reset).
  }, []);

  const handleCopyDeviceId = useCallback(() => {
    // navigator.clipboard is available in extension UI contexts; the catch
    // keeps a non-secure-context test environment from blowing up.
    void navigator.clipboard.writeText(auth.deviceId).catch(() => {
      // intentionally ignored — silent failure is acceptable for a copy.
    });
  }, [auth.deviceId]);

  return (
    <div className="space-y-6 p-8" data-testid="server-connected">
      <ServerHero
        state="connected"
        host={savedConfig.host}
        onSwitchChange={handleSwitchChange}
        onSyncNow={handleSyncNow}
        onForgetServer={handleForgetServer}
        onReconfigure={handleReconfigure}
        onCopyDeviceId={handleCopyDeviceId}
      />
      <ServerInfoCard savedConfig={savedConfig} auth={auth} lastSyncAt={lastSyncAt} />
      <ServerStatsCards host={savedConfig.host} deviceToken={auth.deviceToken} />
      <ServerSyncLog />
    </div>
  );
}
