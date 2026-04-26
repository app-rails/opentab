import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@opentab/ui/components/accordion";
import { Button } from "@opentab/ui/components/button";
import { Input } from "@opentab/ui/components/input";
import { cn } from "@opentab/ui/lib/utils";
import { useMachine } from "@xstate/react";
import type { TFunction } from "i18next";
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, LoaderIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
  clearProgress,
  loadProgress,
  saveProgress,
  type WizardProgress,
} from "@/lib/sync-setup/wizard-progress";

// User-visible step ids; the wizard owns this naming. We deliberately do
// NOT persist this set across sessions — only `lastHost` + `backupFilename`
// survive a reload (see wizard-progress.ts comment for the rationale).
type SetupStepId = "backup" | "connect" | "authorize" | "transfer";

/**
 * Sync setup wizard (spec §2.4.5 + §2.4.5a).
 *
 * The XState machine in `state-machine.ts` carries 14 internal states. We
 * present those as 4 user-visible steps using an accordion:
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ STEP        XState states                              │
 *   ├────────────────────────────────────────────────────────┤
 *   │ backup      idle / backup_running / backup_done        │
 *   │ connect     host_input / permission_requesting /       │
 *   │             health_checking / health_failed            │
 *   │ authorize   awaiting_authorization /                   │
 *   │             authorization_timeout /                    │
 *   │             authorization_denied /                     │
 *   │             consuming_exchange / exchange_invalid      │
 *   │ transfer    direction_choice / uploading /             │
 *   │             downloading / complete                     │
 *   └────────────────────────────────────────────────────────┘
 *
 * Cross-tab persistence: completion marks + the host the user typed + the
 * backup filename live in `localStorage` (see wizard-progress.ts) so closing
 * settings mid-flow doesn't wipe context. Short-lived OAuth secrets are
 * intentionally NOT persisted — the Authorize step always re-mints.
 *
 * All side-effectful actors are injected here so the machine itself stays
 * DOM-free; the UI also owns:
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

// --- Step taxonomy ---------------------------------------------------------

const STEP_ORDER: readonly SetupStepId[] = ["backup", "connect", "authorize", "transfer"];

const STEP_OF_STATE: Record<string, SetupStepId> = {
  idle: "backup",
  backup_running: "backup",
  backup_done: "backup",
  host_input: "connect",
  permission_requesting: "connect",
  health_checking: "connect",
  health_failed: "connect",
  awaiting_authorization: "authorize",
  authorization_timeout: "authorize",
  authorization_denied: "authorize",
  consuming_exchange: "authorize",
  exchange_invalid: "authorize",
  direction_choice: "transfer",
  uploading: "transfer",
  downloading: "transfer",
  complete: "transfer",
};

// Literal types matter — i18next's typed t() refuses string-typed lookups.
const STEP_LABEL_KEYS = {
  backup: "settings.sync.setup.steps.backup",
  connect: "settings.sync.setup.steps.connect",
  authorize: "settings.sync.setup.steps.authorize",
  transfer: "settings.sync.setup.steps.transfer",
} as const satisfies Record<SetupStepId, string>;

const ERROR_STATES: ReadonlySet<string> = new Set([
  "health_failed",
  "authorization_timeout",
  "authorization_denied",
  "exchange_invalid",
]);

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
        // Reset the outbox before re-bootstrapping. Each wizard run is "I
        // want to publish my current local state", so any leftover pending
        // ops from prior wizard attempts (which would otherwise accumulate
        // duplicate create-ops for the same entitySyncIds and bloat the
        // outbox unboundedly across reruns) get cleared first.
        // `force: true` is also required: previous wizard runs leave
        // syncMeta.initialPushCompleted=true; without force, initialBootstrap
        // short-circuits at line 1 and produces zero network requests.
        await db.syncOutbox.clear();
        await engine.initialBootstrap({ force: true });
        return undefined;
      }),
      downloadSnapshot: fromPromise<undefined, DownloadSnapshotInput>(async () => {
        const engine = engineRef.current;
        if (!engine) throw new Error("engine_not_initialised");
        const cred = exchangeRef.current;
        if (cred) {
          await setSyncAuth({ kind: "authenticated", ...cred });
        }
        // Wizard "Download server data" replaces the local copy with the
        // server's. Drop any pending outbox ops so we don't push stale
        // local mutations back up just before overwriting them locally.
        await db.syncOutbox.clear();
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
    return <LoadingShell />;
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

function LoadingShell() {
  const { t } = useTranslation();
  return <div className="text-muted-foreground text-sm">{t("settings.sync.setup.loading")}</div>;
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
  const { t } = useTranslation();

  // --- Persisted progress (load once) -------------------------------------
  const [progress, setProgress] = useState<WizardProgress>(
    () =>
      loadProgress() ?? {
        lastHost: null,
        backupFilename: null,
        updatedAt: 0,
      },
  );

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
  const machineActiveStep: SetupStepId = STEP_OF_STATE[value] ?? "backup";

  // --- Completion derivation (current session only) ------------------------
  // Step ✓ marks come purely from machine progression in *this* session. We
  // intentionally don't seed from localStorage: persisted "connect / authorize
  // done" is a lie because both reset on reload (single-use OAuth code, fresh
  // health check), and showing them as ✓ on remount caused the inconsistency
  // bug where a re-mounted machine at idle showed connect+authorize ✓ but
  // the active backup step looked pending.
  const completedSet = useMemo(() => {
    const set = new Set<SetupStepId>();
    const currentIdx = STEP_ORDER.indexOf(machineActiveStep);
    for (let i = 0; i < currentIdx; i++) set.add(STEP_ORDER[i]);
    if (value === "complete") for (const s of STEP_ORDER) set.add(s);
    return set;
  }, [machineActiveStep, value]);

  // --- Persist host + backup filename only (see wizard-progress.ts) -------
  useEffect(() => {
    const nextHost = ctx.host || progress.lastHost;
    const nextBackup = ctx.backupFilename || progress.backupFilename;

    if (nextHost === progress.lastHost && nextBackup === progress.backupFilename) {
      return;
    }

    saveProgress({ lastHost: nextHost, backupFilename: nextBackup });
    setProgress((prev) => ({
      ...prev,
      lastHost: nextHost,
      backupFilename: nextBackup,
      updatedAt: Date.now(),
    }));
  }, [ctx.host, ctx.backupFilename, progress]);

  // --- Accordion controlled state (default = active step) -----------------
  const [openStepId, setOpenStepId] = useState<SetupStepId>(machineActiveStep);
  // Track whether the user has manually overridden expansion this session;
  // if not, follow the active step. Once they override (by clicking another
  // step's trigger), respect that until the active step changes again.
  const lastSyncedActiveRef = useRef<SetupStepId>(machineActiveStep);
  useEffect(() => {
    if (lastSyncedActiveRef.current !== machineActiveStep) {
      lastSyncedActiveRef.current = machineActiveStep;
      setOpenStepId(machineActiveStep);
    }
  }, [machineActiveStep]);

  // --- Local UI bits ------------------------------------------------------
  const [hostDraft, setHostDraft] = useState<string>(
    ctx.host || progress.lastHost || DEFAULT_SYNC_HOST,
  );
  const [downloadConfirmed, setDownloadConfirmed] = useState(false);

  const handleCancel = useCallback(() => {
    send({ type: "CANCEL" });
    clearProgress();
    setProgress({ lastHost: null, backupFilename: null, updatedAt: 0 });
    onCancel?.();
  }, [send, onCancel]);

  const handleComplete = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.SYNC_SETUP_COMPLETE }).catch(() => {});
    clearProgress();
    onClose?.();
  }, [onClose]);

  const completedCount = completedSet.size;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{t("settings.sync.setup.title")}</p>
        <span className="text-muted-foreground text-xs">
          {t("settings.sync.setup.progress", { done: completedCount, total: STEP_ORDER.length })}
        </span>
      </div>

      <Accordion
        type="single"
        collapsible
        value={openStepId}
        onValueChange={(v) => setOpenStepId((v || machineActiveStep) as SetupStepId)}
        className="space-y-2"
      >
        {STEP_ORDER.map((stepId) => {
          const status = stepStatus(stepId, machineActiveStep, value, completedSet);
          return (
            <AccordionItem
              key={stepId}
              value={stepId}
              className="rounded-md border border-border last:border-b"
            >
              <AccordionTrigger className="px-4">
                <span className="flex items-center gap-2">
                  <StepStatusIcon status={status} />
                  <span>{t(STEP_LABEL_KEYS[stepId])}</span>
                  <StepStatusTag status={status} t={t} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 px-4">
                {stepId === "backup" && (
                  <BackupBody
                    value={value}
                    backupFilename={ctx.backupFilename ?? progress.backupFilename}
                    onStart={() => send({ type: "START" })}
                    onCancel={handleCancel}
                  />
                )}
                {stepId === "connect" && (
                  <ConnectBody
                    value={value}
                    host={ctx.host}
                    hostDraft={hostDraft}
                    setHostDraft={setHostDraft}
                    healthResult={ctx.healthResult}
                    error={ctx.error}
                    onSubmitHost={() => send({ type: "HOST_SUBMITTED", host: hostDraft.trim() })}
                    onRetry={() => send({ type: "RETRY" })}
                    onCancel={handleCancel}
                    canSubmit={
                      value === "backup_done" || value === "host_input" || value === "health_failed"
                    }
                  />
                )}
                {stepId === "authorize" && (
                  <AuthorizeBody
                    value={value}
                    error={ctx.error}
                    onRetry={() => send({ type: "RETRY" })}
                    onCancel={handleCancel}
                  />
                )}
                {stepId === "transfer" && (
                  <TransferBody
                    value={value}
                    canUpload={ctx.hasLocalData}
                    canDownload={ctx.hasServerData}
                    downloadConfirmed={downloadConfirmed}
                    setDownloadConfirmed={setDownloadConfirmed}
                    onUpload={() => send({ type: "CHOSE_UPLOAD" })}
                    onConfirmDownload={() => {
                      setDownloadConfirmed(false);
                      send({ type: "CHOSE_DOWNLOAD" });
                    }}
                    onComplete={handleComplete}
                    onCancel={handleCancel}
                  />
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step body components
// ---------------------------------------------------------------------------

interface BackupBodyProps {
  value: string;
  backupFilename: string | null;
  onStart: () => void;
  onCancel: () => void;
}

function BackupBody({ value, backupFilename, onStart, onCancel }: BackupBodyProps) {
  const { t } = useTranslation();
  if (value === "backup_running") {
    return (
      <p className="text-muted-foreground text-sm">{t("settings.sync.setup.backup.running")}</p>
    );
  }
  if (backupFilename && (value === "backup_done" || STEP_OF_STATE[value] !== "backup")) {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.setup.backup.saved", { filename: backupFilename })}
        </p>
        {value === "backup_done" && (
          <Button size="sm" onClick={onStart}>
            {t("settings.sync.setup.backup.continue")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{t("settings.sync.setup.backup.get_started")}</p>
      {/* If a previous wizard run already wrote a backup, surface it so the
          user knows the file isn't lost — the local-first invariant is the
          point of this whole step. The wizard still re-runs backup on
          Enable Sync because each session writes a fresh timestamped file. */}
      {backupFilename && value === "idle" && (
        <p className="text-muted-foreground text-xs">
          {t("settings.sync.setup.backup.last_backup", { filename: backupFilename })}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onStart}>
          {value === "backup_done"
            ? t("settings.sync.setup.backup.continue")
            : t("settings.sync.setup.backup.enable")}
        </Button>
        {value !== "idle" && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("settings.sync.setup.backup.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}

interface ConnectBodyProps {
  value: string;
  host: string;
  hostDraft: string;
  setHostDraft: (v: string) => void;
  healthResult: HealthCheckResult | null;
  error: string | null;
  canSubmit: boolean;
  onSubmitHost: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function ConnectBody({
  value,
  host,
  hostDraft,
  setHostDraft,
  healthResult,
  error,
  canSubmit,
  onSubmitHost,
  onRetry,
  onCancel,
}: ConnectBodyProps) {
  const { t } = useTranslation();
  if (value === "permission_requesting") {
    return (
      <p className="text-muted-foreground text-sm">
        {t("settings.sync.setup.connect.requesting_permission")}
      </p>
    );
  }
  if (value === "health_checking") {
    return (
      <p className="text-muted-foreground text-sm">
        {t("settings.sync.setup.connect.checking_health")}
      </p>
    );
  }
  if (value === "health_failed") {
    return (
      <div className="space-y-3">
        <HealthFailureMessage result={healthResult} t={t} />
        <div className="flex gap-2">
          <Button size="sm" onClick={onRetry}>
            {t("settings.sync.setup.connect.retry")}
          </Button>
          <Button size="sm" variant="outline" onClick={onSubmitHost}>
            {t("settings.sync.setup.connect.change_host")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("settings.sync.setup.connect.cancel")}
          </Button>
        </div>
      </div>
    );
  }
  // Past this step (authorize+) — show the host as a static read-out.
  if (STEP_OF_STATE[value] !== "connect") {
    return (
      <p className="text-muted-foreground text-sm">
        {t("settings.sync.setup.connect.connected", { host })}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        {t("settings.sync.setup.connect.host_help", { default: DEFAULT_SYNC_HOST })}
      </p>
      <Input
        value={hostDraft}
        onChange={(e) => setHostDraft(e.target.value)}
        placeholder={DEFAULT_SYNC_HOST}
        aria-label={t("settings.sync.setup.connect.host_aria")}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmitHost} disabled={!hostDraft.trim() || !canSubmit}>
          {t("settings.sync.setup.connect.save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("settings.sync.setup.connect.cancel")}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

interface AuthorizeBodyProps {
  value: string;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

function AuthorizeBody({ value, error, onRetry, onCancel }: AuthorizeBodyProps) {
  const { t } = useTranslation();
  switch (value) {
    case "awaiting_authorization":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {t("settings.sync.setup.authorize.waiting")}
          </p>
          <Button size="sm" variant="outline" onClick={onCancel}>
            {t("settings.sync.setup.authorize.cancel")}
          </Button>
        </div>
      );
    case "authorization_timeout":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {t("settings.sync.setup.authorize.timeout")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onRetry}>
              {t("settings.sync.setup.authorize.retry")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("settings.sync.setup.authorize.cancel")}
            </Button>
          </div>
        </div>
      );
    case "authorization_denied":
      return (
        <div className="space-y-2">
          <p className="text-destructive text-sm">
            {error ?? t("settings.sync.setup.authorize.denied_default")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onRetry}>
              {t("settings.sync.setup.authorize.retry")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("settings.sync.setup.authorize.cancel")}
            </Button>
          </div>
        </div>
      );
    case "consuming_exchange":
      return (
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.setup.authorize.consuming")}
        </p>
      );
    case "exchange_invalid":
      return (
        <div className="space-y-2">
          <p className="text-destructive text-sm">
            {error ?? t("settings.sync.setup.authorize.exchange_invalid_default")}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onRetry}>
              {t("settings.sync.setup.authorize.retry")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("settings.sync.setup.authorize.cancel")}
            </Button>
          </div>
        </div>
      );
    default:
      // STEP_OF_STATE[value] !== "authorize" — past this step
      return (
        <p className="text-muted-foreground text-sm">{t("settings.sync.setup.authorize.done")}</p>
      );
  }
}

interface TransferBodyProps {
  value: string;
  canUpload: boolean;
  canDownload: boolean;
  downloadConfirmed: boolean;
  setDownloadConfirmed: (v: boolean) => void;
  onUpload: () => void;
  onConfirmDownload: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

function TransferBody({
  value,
  canUpload,
  canDownload,
  downloadConfirmed,
  setDownloadConfirmed,
  onUpload,
  onConfirmDownload,
  onComplete,
  onCancel,
}: TransferBodyProps) {
  const { t } = useTranslation();
  if (value === "uploading") {
    return (
      <p className="text-muted-foreground text-sm">{t("settings.sync.setup.transfer.uploading")}</p>
    );
  }
  if (value === "downloading") {
    return (
      <p className="text-muted-foreground text-sm">
        {t("settings.sync.setup.transfer.downloading")}
      </p>
    );
  }
  if (value === "complete") {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.setup.transfer.complete_body")}
        </p>
        <Button size="sm" onClick={onComplete}>
          {t("settings.sync.setup.transfer.close")}
        </Button>
      </div>
    );
  }
  if (value === "direction_choice") {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.setup.transfer.direction_help")}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onUpload}
            disabled={!canUpload}
            aria-label={t("settings.sync.setup.transfer.upload_aria")}
          >
            {t("settings.sync.setup.transfer.upload")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDownloadConfirmed(true)}
            disabled={!canDownload}
            aria-label={t("settings.sync.setup.transfer.download_aria")}
          >
            {t("settings.sync.setup.transfer.download")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("settings.sync.setup.transfer.cancel")}
          </Button>
        </div>
        {!canUpload && !canDownload && (
          <p className="text-muted-foreground text-xs">
            {t("settings.sync.setup.transfer.no_data")}
          </p>
        )}
        {downloadConfirmed && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm">{t("settings.sync.setup.transfer.download_warning")}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={onConfirmDownload}>
                {t("settings.sync.setup.transfer.confirm_download")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDownloadConfirmed(false)}>
                {t("settings.sync.setup.transfer.back")}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      {t("settings.sync.setup.transfer.waiting_previous")}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Step header status helpers
// ---------------------------------------------------------------------------

type StepStatus = "pending" | "active" | "in_progress" | "error" | "done";

const ACTIVE_BUSY_STATES: ReadonlySet<string> = new Set([
  "backup_running",
  "permission_requesting",
  "health_checking",
  "consuming_exchange",
  "uploading",
  "downloading",
]);

function stepStatus(
  stepId: SetupStepId,
  activeStep: SetupStepId,
  value: string,
  completed: ReadonlySet<SetupStepId>,
): StepStatus {
  if (completed.has(stepId) && stepId !== activeStep) return "done";
  if (value === "complete") return "done";
  if (stepId !== activeStep) return "pending";
  if (ERROR_STATES.has(value)) return "error";
  if (ACTIVE_BUSY_STATES.has(value)) return "in_progress";
  return "active";
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return <CircleCheckIcon className="size-4 shrink-0 text-status-green" />;
    case "in_progress":
      return <LoaderIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />;
    case "error":
      return <CircleAlertIcon className="size-4 shrink-0 text-destructive" />;
    case "active":
      return <CircleDashedIcon className="size-4 shrink-0 text-foreground" />;
    default:
      return <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
}

function StepStatusTag({ status, t }: { status: StepStatus; t: TFunction }) {
  const labelKey =
    status === "done"
      ? "settings.sync.setup.status_tag.done"
      : status === "in_progress"
        ? "settings.sync.setup.status_tag.working"
        : status === "error"
          ? "settings.sync.setup.status_tag.error"
          : status === "active"
            ? "settings.sync.setup.status_tag.active"
            : "settings.sync.setup.status_tag.pending";
  return (
    <span
      className={cn(
        "ml-2 rounded-full px-2 py-0.5 text-xs",
        status === "done" && "bg-muted text-muted-foreground",
        status === "in_progress" && "bg-muted text-foreground",
        status === "error" && "bg-destructive/10 text-destructive",
        status === "active" && "bg-accent text-accent-foreground",
        status === "pending" && "bg-muted text-muted-foreground",
      )}
    >
      {t(labelKey)}
    </span>
  );
}

function HealthFailureMessage({ result, t }: { result: HealthCheckResult | null; t: TFunction }) {
  if (!result) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("settings.sync.setup.connect.health.unknown")}
      </p>
    );
  }
  switch (result.kind) {
    case "unreachable":
      return (
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.setup.connect.health.unreachable", { error: result.error })}
        </p>
      );
    case "server_too_old":
      return (
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.setup.connect.health.server_too_old", {
            version: result.serverProtocol,
          })}
        </p>
      );
    default:
      return (
        <p className="text-muted-foreground text-sm">
          {t("settings.sync.setup.connect.health.not_ready")}
        </p>
      );
  }
}
