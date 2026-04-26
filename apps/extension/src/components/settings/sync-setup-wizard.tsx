import { Button } from "@opentab/ui/components/button";
import { Input } from "@opentab/ui/components/input";
import { useMachine } from "@xstate/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fromPromise } from "xstate";
import { MSG } from "@/lib/constants";
import { db } from "@/lib/db";
import { activeWorkspaces } from "@/lib/db-queries";
import { resolveAccountId } from "@/lib/resolve-account-id";
import { setSyncAuth } from "@/lib/sync-auth-storage";
import { SyncClient } from "@/lib/sync-client";
import { SyncEngine } from "@/lib/sync-engine";
import { checkHealth as doCheckHealth } from "@/lib/sync-setup/api-handshake";
import { exportLocalBackupToDownloads } from "@/lib/sync-setup/backup";
import { DEFAULT_SYNC_HOST } from "@/lib/sync-setup/config";
import { getOrCreatePersistedDeviceId } from "@/lib/sync-setup/device-identity";
import { consumeExchangeCode, openAuthorizationTab } from "@/lib/sync-setup/exchange";
import type { SetupCallbackPayload } from "@/lib/sync-setup/setup-callback-shared";
import { createSetupMachine, type SetupMachineActors } from "@/lib/sync-setup/state-machine";
import type {
  CheckHealthInput,
  ConsumeExchangeInput,
  DownloadSnapshotInput,
  HealthCheckResult,
  OpenAuthorizationInput,
  RequestPermissionInput,
  UploadBootstrapInput,
} from "@/lib/sync-setup/types";
import { useSetupCallbackBridge } from "@/lib/sync-setup/use-callback-bridge";

/**
 * Sync setup wizard (spec §2.4.5 + §2.4.5a).
 *
 * Renders the current state of the XState machine from Task 38 with a small
 * set of cards. All side-effectful actors are injected here so the machine
 * itself stays DOM-free; the UI also owns:
 *   - the callback bridge (runtime message + storage sweep) via
 *     `useSetupCallbackBridge`, dispatching `AUTHORIZATION_CALLBACK`,
 *   - persisting the exchange result to `chrome.storage.local.opentab_sync_auth_v1`
 *     via `setSyncAuth`,
 *   - firing `SYNC_SETUP_COMPLETE` to the background when the user closes
 *     the wizard.
 *
 * Direction-choice gate (`hasServerData`): handled by a custom
 * `consumeExchange` actor that runs the real exchange, then probes
 * `/api/sync/snapshot` with the fresh token to see if the server has any
 * workspaces. The boolean is returned via a ref (since we can only return
 * the `ExchangeConsumeResponse` shape from the actor) and flushed into the
 * machine context when entering `direction_choice`.
 */

interface SyncSetupWizardProps {
  /** Called when the user dismisses the wizard after `complete`. */
  onClose?: () => void;
  /** Allows the parent to know when the user explicitly cancels. */
  onCancel?: () => void;
}

function detectPlatform(): string {
  if (typeof navigator !== "undefined" && "userAgent" in navigator) {
    const ua = navigator.userAgent;
    if (ua.includes("Mac")) return "macos";
    if (ua.includes("Win")) return "windows";
    if (ua.includes("Linux")) return "linux";
    if (ua.includes("Android")) return "android";
  }
  return "web";
}

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function deviceNameFromPlatform(platform: string): string {
  switch (platform) {
    case "macos":
      return "Chrome on macOS";
    case "windows":
      return "Chrome on Windows";
    case "linux":
      return "Chrome on Linux";
    case "android":
      return "Chrome on Android";
    default:
      return "Chrome";
  }
}

async function probeServerHasData(host: string, token: string): Promise<boolean> {
  try {
    const client = new SyncClient(host, token);
    const snap = await client.snapshot();
    return snap.workspaces.length > 0 || snap.collections.length > 0 || snap.tabs.length > 0;
  } catch {
    // If the probe fails (network, 401, etc.), assume no data so the user
    // still sees the choice UI. The subsequent download/upload attempt will
    // surface the real error if any.
    return false;
  }
}

export function SyncSetupWizard({ onClose, onCancel }: SyncSetupWizardProps) {
  const [hasLocalData, setHasLocalData] = useState(false);
  const [initialDeviceId, setInitialDeviceId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The exchange actor receives the new deviceToken and uses it to probe the
  // server for existing data. We stash the probe result here so the UI can
  // read it when the machine transitions to direction_choice.
  const probedServerHasDataRef = useRef(false);
  // Holds the SyncEngine instance built from the freshly-received deviceToken.
  // Lives across uploading/downloading states.
  const engineRef = useRef<SyncEngine | null>(null);
  const exchangeRef = useRef<{
    host: string;
    deviceId: string;
    deviceToken: string;
    deviceName: string;
  } | null>(null);

  // Boot: resolve persistent device id + local data flag.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deviceId, accountId] = await Promise.all([
          getOrCreatePersistedDeviceId(),
          resolveAccountId(),
        ]);
        const wsCount = await activeWorkspaces(accountId).count();
        if (cancelled) return;
        setInitialDeviceId(deviceId);
        setHasLocalData(wsCount > 0);
        setReady(true);
      } catch (err) {
        console.error("[sync-setup-wizard] bootstrap failed", err);
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const platform = useMemo(detectPlatform, []);
  const extVersion = useMemo(extensionVersion, []);
  const deviceName = useMemo(() => deviceNameFromPlatform(platform), [platform]);

  // Build the actor map once — injecting real side effects so the machine
  // stays DOM-free. The tricky one is `consumeExchange`: it runs the real
  // API call, builds the engine, and also probes the server snapshot.
  const actors = useMemo<SetupMachineActors>(() => {
    return {
      exportBackup: fromPromise(async () => {
        const result = await exportLocalBackupToDownloads();
        return { filename: result.filename };
      }),
      requestPermission: fromPromise<boolean, RequestPermissionInput>(async ({ input }) => {
        // Optional host-permission elevation. If the permission API is absent
        // (e.g. test / non-MV3 context) we treat the grant as implicit.
        if (typeof chrome === "undefined" || !chrome.permissions) return true;
        try {
          const origins = [`${input.host.replace(/\/$/, "")}/*`];
          const already = await chrome.permissions.contains({ origins });
          if (already) return true;
          return await chrome.permissions.request({ origins });
        } catch {
          return true;
        }
      }),
      checkHealth: fromPromise<HealthCheckResult, CheckHealthInput>(async ({ input }) => {
        return doCheckHealth(input.host);
      }),
      openAuthorization: fromPromise<number, OpenAuthorizationInput>(async ({ input }) => {
        return openAuthorizationTab({
          host: input.host,
          nonce: input.nonce,
          deviceName: input.deviceName,
          platform: input.platform,
          extensionVersion: input.extensionVersion,
        });
      }),
      consumeExchange: fromPromise<
        Awaited<ReturnType<typeof consumeExchangeCode>>,
        ConsumeExchangeInput
      >(async ({ input }) => {
        const response = await consumeExchangeCode({
          host: input.host,
          exchangeCode: input.exchangeCode,
          nonce: input.nonce,
          deviceId: input.deviceId,
          deviceName: input.deviceName,
          platform: input.platform,
          extensionVersion: input.extensionVersion,
        });
        // Stash the cred set for downstream transitions.
        exchangeRef.current = {
          host: input.host,
          deviceId: response.deviceId,
          deviceToken: response.deviceToken,
          deviceName: response.deviceName,
        };
        // Instantiate the engine immediately so uploading/downloading states
        // can call methods without rebuilding the client each time.
        engineRef.current = new SyncEngine(new SyncClient(input.host, response.deviceToken));
        // Probe server snapshot once, before entering direction_choice.
        probedServerHasDataRef.current = await probeServerHasData(input.host, response.deviceToken);
        return response;
      }),
      uploadBootstrap: fromPromise<undefined, UploadBootstrapInput>(async () => {
        const engine = engineRef.current;
        if (!engine) throw new Error("engine_not_initialised");
        // Persist auth BEFORE initialBootstrap — the SyncEngine's inner
        // SyncClient was built with a fresh token but subsequent polling will
        // rebuild from storage, so we must have the authenticated record
        // written before anything else touches the sync path.
        const cred = exchangeRef.current;
        if (cred) {
          await setSyncAuth({ kind: "authenticated", ...cred });
        }
        await engine.initialBootstrap();
        return undefined;
      }),
      downloadSnapshot: fromPromise<undefined, DownloadSnapshotInput>(async () => {
        const engine = engineRef.current;
        if (!engine) throw new Error("engine_not_initialised");
        const cred = exchangeRef.current;
        if (cred) {
          await setSyncAuth({ kind: "authenticated", ...cred });
        }
        // SyncEngine.sync() with resetRequired=true would trigger a fullReset,
        // but to force the "download everything" path here we trigger the
        // snapshot-driven reset explicitly via a public-ish entry point:
        // calling `sync()` after clearing the cursor works on fresh installs.
        await db.syncMeta.put({ key: "pullCursor", value: 0 });
        await engine.sync();
        return undefined;
      }),
    };
  }, []);

  // Create the machine once per ready bootstrap.
  const machine = useMemo(() => {
    if (!ready || !initialDeviceId) return null;
    return createSetupMachine({ actors });
  }, [ready, initialDeviceId, actors]);

  if (!machine || !initialDeviceId) {
    return <div className="text-muted-foreground text-sm">Loading setup wizard...</div>;
  }

  return (
    <SyncSetupWizardInner
      machine={machine}
      deviceId={initialDeviceId}
      deviceName={deviceName}
      platform={platform}
      extensionVersion={extVersion}
      hasLocalData={hasLocalData}
      probedServerHasDataRef={probedServerHasDataRef}
      onClose={onClose}
      onCancel={onCancel}
    />
  );
}

interface WizardInnerProps {
  machine: ReturnType<typeof createSetupMachine>;
  deviceId: string;
  deviceName: string;
  platform: string;
  extensionVersion: string;
  hasLocalData: boolean;
  probedServerHasDataRef: React.MutableRefObject<boolean>;
  onClose?: () => void;
  onCancel?: () => void;
}

function SyncSetupWizardInner(props: WizardInnerProps) {
  const {
    machine,
    deviceId,
    deviceName,
    platform,
    extensionVersion: extVersion,
    hasLocalData,
    probedServerHasDataRef,
    onClose,
    onCancel,
  } = props;

  const [state, send] = useMachine(machine, {
    input: {
      deviceName,
      platform,
      extensionVersion: extVersion,
      deviceId,
      hasLocalData,
    },
  });

  const handleCallback = useCallback(
    (payload: SetupCallbackPayload) => {
      if (payload.error) {
        send({ type: "AUTHORIZATION_DENIED", error: payload.error });
        return;
      }
      if (!payload.exchangeCode || !payload.nonce) return;
      send({
        type: "AUTHORIZATION_CALLBACK",
        exchangeCode: payload.exchangeCode,
        nonce: payload.nonce,
      });
    },
    [send],
  );
  useSetupCallbackBridge(handleCallback);

  // When we land on `direction_choice`, flush the probed server flag into
  // the machine context so the guards fire correctly.
  // biome-ignore lint/correctness/useExhaustiveDependencies: probedServerHasDataRef.current is intentional
  useEffect(() => {
    if (state.matches("direction_choice") && !state.context.hasServerData) {
      if (probedServerHasDataRef.current) {
        // We need to set context.hasServerData without a first-class event,
        // so reuse an existing channel: resend the cached exchange response.
        if (state.context.exchangeResponse) {
          send({ type: "EXCHANGE_OK", response: state.context.exchangeResponse });
        }
      }
    }
    // We intentionally only want this to re-run when the *value* changes.
  }, [state.value]);

  const value = typeof state.value === "string" ? state.value : JSON.stringify(state.value);
  const ctx = state.context;

  const [hostDraft, setHostDraft] = useState(ctx.host);
  const [downloadConfirmed, setDownloadConfirmed] = useState(false);

  const handleCancel = useCallback(() => {
    send({ type: "CANCEL" });
    onCancel?.();
  }, [send, onCancel]);

  const handleComplete = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.SYNC_SETUP_COMPLETE }).catch(() => {});
    onClose?.();
  }, [onClose]);

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {(value === "idle" || value === "backup_running" || value === "backup_done") && (
        <GetStartedCard state={value} onStart={() => send({ type: "START" })} />
      )}

      {value === "host_input" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Server host</h4>
          <p className="text-muted-foreground text-sm">
            Enter the OpenTab sync server URL. Defaults to{" "}
            <code className="rounded bg-muted px-1">{DEFAULT_SYNC_HOST}</code>.
          </p>
          <Input
            value={hostDraft}
            onChange={(e) => setHostDraft(e.target.value)}
            placeholder={DEFAULT_SYNC_HOST}
            aria-label="Server host"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => send({ type: "HOST_SUBMITTED", host: hostDraft.trim() })}
              disabled={!hostDraft.trim()}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
          {ctx.error && <p className="text-destructive text-sm">{ctx.error}</p>}
        </div>
      )}

      {value === "permission_requesting" && (
        <LoadingCard
          title="Requesting permission"
          body="Permission required — please approve the browser prompt."
        />
      )}

      {value === "health_checking" && (
        <LoadingCard title="Checking server" body="Contacting the sync server..." />
      )}

      {value === "health_failed" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Can't reach server</h4>
          <HealthFailureMessage result={ctx.healthResult} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => send({ type: "RETRY" })}>
              Retry
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => send({ type: "HOST_SUBMITTED", host: hostDraft.trim() || ctx.host })}
            >
              Change host
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {value === "awaiting_authorization" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Waiting for approval</h4>
          <p className="text-muted-foreground text-sm">
            Waiting for you to approve in the new tab...
          </p>
          <Button size="sm" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}

      {value === "authorization_timeout" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Authorization timed out</h4>
          <p className="text-muted-foreground text-sm">
            The authorization tab didn't respond in time.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => send({ type: "RETRY" })}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {value === "authorization_denied" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Authorization denied</h4>
          <p className="text-destructive text-sm">{ctx.error ?? "Access was declined."}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => send({ type: "RETRY" })}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {value === "consuming_exchange" && (
        <LoadingCard title="Finalising" body="Exchanging authorization with the server..." />
      )}

      {value === "exchange_invalid" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Handshake failed</h4>
          <p className="text-destructive text-sm">{ctx.error ?? "Exchange invalid."}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => send({ type: "RETRY" })}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {value === "direction_choice" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Choose direction</h4>
          <p className="text-muted-foreground text-sm">
            Decide whether to upload the local workspaces to the server or replace them with the
            server's copy.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => send({ type: "CHOSE_UPLOAD" })}
              disabled={!ctx.hasLocalData}
              aria-label="Upload local to server"
            >
              Upload local data
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDownloadConfirmed(true)}
              disabled={!ctx.hasServerData}
              aria-label="Download server to local"
            >
              Download server data
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
          {!ctx.hasLocalData && !ctx.hasServerData && (
            <p className="text-muted-foreground text-xs">
              Neither side has data. Pick either path to finish setup — both are no-ops.
            </p>
          )}
          {downloadConfirmed && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm">
                This will replace your local workspaces with the server's copy. A backup was saved
                before the wizard started.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setDownloadConfirmed(false);
                    send({ type: "CHOSE_DOWNLOAD" });
                  }}
                >
                  Confirm download
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDownloadConfirmed(false)}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {value === "uploading" && (
        <LoadingCard title="Uploading" body="Pushing your workspaces to the server..." />
      )}

      {value === "downloading" && (
        <LoadingCard title="Downloading" body="Replacing local data with the server's copy..." />
      )}

      {value === "complete" && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Setup complete</h4>
          <p className="text-muted-foreground text-sm">
            Your extension is now syncing with the server.
          </p>
          <Button size="sm" onClick={handleComplete}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

function GetStartedCard({ state, onStart }: { state: string; onStart: () => void }) {
  const title =
    state === "backup_running"
      ? "Creating local backup..."
      : state === "backup_done"
        ? "Backup ready"
        : "Get started";
  const body =
    state === "backup_running"
      ? "We're saving a JSON snapshot of your workspaces before touching the server."
      : state === "backup_done"
        ? "Backup saved to your Downloads folder. Next, pick a sync server."
        : "Enable sync to share your workspaces across devices. We'll back up locally first.";

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-sm">{title}</h4>
      <p className="text-muted-foreground text-sm">{body}</p>
      <Button size="sm" onClick={onStart} disabled={state === "backup_running"}>
        {state === "backup_done" ? "Continue" : "Enable Sync"}
      </Button>
    </div>
  );
}

function LoadingCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">{title}</h4>
      <p className="text-muted-foreground text-sm">{body}</p>
    </div>
  );
}

function HealthFailureMessage({ result }: { result: HealthCheckResult | null }) {
  if (!result) {
    return <p className="text-muted-foreground text-sm">Unknown failure.</p>;
  }
  switch (result.kind) {
    case "unreachable":
      return <p className="text-muted-foreground text-sm">Unreachable: {result.error}</p>;
    case "server_too_old":
      return (
        <p className="text-muted-foreground text-sm">
          Server protocol too old ({result.serverProtocol}).
        </p>
      );
    default:
      return <p className="text-muted-foreground text-sm">Server is not ready.</p>;
  }
}
