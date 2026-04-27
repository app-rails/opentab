import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { MSG } from "@/lib/constants";
import { db } from "@/lib/db";
import { fetchServerWhoami } from "@/lib/server-whoami-fetch";
import { getSyncSettings, type SyncSettings, setSyncSettings } from "@/lib/sync-settings";
import { useSyncSettings } from "@/lib/use-sync-settings";
import { ServerEmpty } from "./server-empty";
import { ServerHero } from "./server-hero";
import { ServerInfoCard } from "./server-info-card";
import { ServerPaused } from "./server-paused";
import { ServerReauthBanner } from "./server-reauth-banner";
import { ServerStatsCards } from "./server-stats-cards";
import { ServerSyncLog } from "./server-sync-log";
import { ServerWizard } from "./wizard/server-wizard";

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

  // Reconnect-on-mount: when the page first sees an `enabled + auth` shape
  // we issue one whoami probe to confirm the stored deviceToken still works
  // before painting the connected view. The ref tracks the last token we've
  // already validated so subsequent re-renders (and the storage onChanged
  // we emit on a 401 → setSyncSettings({auth:null}) → useSyncSettings update)
  // don't re-enter the effect for the same token. A genuinely new token
  // (re-auth, host switch) flips the inequality and triggers a fresh probe.
  const validatedTokenRef = useRef<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const enabled = settings.enabled;
  const deviceToken = settings.auth?.deviceToken ?? null;
  const host = settings.savedConfig?.host ?? null;

  useEffect(() => {
    if (!enabled || !deviceToken || !host) return;
    if (validatedTokenRef.current === deviceToken) return;
    validatedTokenRef.current = deviceToken;
    setReconnecting(true);

    let cancelled = false;
    void fetchServerWhoami({ host, deviceToken }).then(async (result) => {
      if (cancelled) return;
      if (result.ok) {
        // Backfill `auth.user` from whoami so the migrated-from-v1 row (which
        // never had user info) gains an identity. Keep the rest of `auth`
        // (deviceToken/deviceId/issuedAt) untouched — we only learned new
        // fields, the existing ones are still valid. Re-read settings here
        // because the in-render snapshot may already be stale by the time
        // the network round-trip resolves.
        const fresh = await getSyncSettings();
        if (fresh.auth && fresh.auth.deviceToken === deviceToken) {
          await setSyncSettings({
            auth: {
              ...fresh.auth,
              user: {
                id: result.whoami.user.id,
                name: result.whoami.user.name ?? result.whoami.user.email,
                email: result.whoami.user.email,
              },
            },
          });
        }
        if (!cancelled) setReconnecting(false);
        return;
      }
      if (result.error === "unauthorized") {
        // Token rejected by the server: clear auth so the dispatcher drops
        // into the reauth path (banner + wizard). The ref still holds the
        // bad token, so the storage onChanged that follows won't re-fetch.
        await setSyncSettings({ auth: null });
        if (!cancelled) setReconnecting(false);
        return;
      }
      // network / server: transient, leave auth in place. The connected view
      // will surface its own retry affordances; we just drop the placeholder.
      if (!cancelled) setReconnecting(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, deviceToken, host]);

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
  if (reconnecting) {
    // Show a brief placeholder instead of <ServerConnected> while the whoami
    // probe is in flight. Avoids a flash of "connected" right before a 401
    // would yank the user into the reauth banner.
    return (
      <div
        className="mx-auto max-w-3xl px-8 pt-10 text-muted-foreground text-sm"
        data-testid="server-reconnecting"
      >
        正在使用上次的认证信息重新连接...
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
 *   reconfigure    →  setReconfiguring(true) → render <ServerWizard> from
 *                     the connect step with reconfigureMode (Step 1 backup
 *                     visually skipped). Cancel → setReconfiguring(false),
 *                     SyncSettings untouched, falls back to this connected
 *                     view with the existing token.
 *                     TODO(spec §6.1): if Step 3 OAuth exchange invalidates
 *                     the prior token before complete, "取消重新配置" past
 *                     Step 3 cannot recover the original connected view;
 *                     pending decision in spec §6.1 last item.
 *   copy device id →  navigator.clipboard.writeText(auth.deviceId)
 *
 * lastSyncAt comes from db.syncMeta (engine writes it on every successful
 * sync; same source SyncStatusCard reads).
 */
function ServerConnected({ savedConfig, auth, hostHistory }: ServerConnectedProps) {
  // Local-only flag; reset on unmount. SyncSettings is the source of truth
  // for "am I really connected" — `reconfiguring` only controls which view
  // we paint *over* the connected state. Cancelling drops it back to false
  // with no SyncSettings write, so the previous connected view returns.
  const [reconfiguring, setReconfiguring] = useState(false);

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
    setReconfiguring(true);
  }, []);

  const handleCancelReconfigure = useCallback(() => {
    setReconfiguring(false);
  }, []);

  const handleCopyDeviceId = useCallback(() => {
    // navigator.clipboard is available in extension UI contexts; the catch
    // keeps a non-secure-context test environment from blowing up.
    void navigator.clipboard.writeText(auth.deviceId).catch(() => {
      // intentionally ignored — silent failure is acceptable for a copy.
    });
  }, [auth.deviceId]);

  if (reconfiguring) {
    // Re-enter the wizard from Step 2 (connect). Step 1 (backup) shown as
    // "已跳过" in the header so users see the full 5-step rhythm but can't
    // navigate back into a redundant local backup.
    return (
      <ServerWizard
        startStep="connect"
        reconfigureMode
        onCancelReconfigure={handleCancelReconfigure}
      />
    );
  }

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
