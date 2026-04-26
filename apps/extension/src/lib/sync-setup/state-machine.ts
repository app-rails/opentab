import type { ExchangeConsumeResponse, HealthResponse } from "@opentab/protocol";
import { assign, fromPromise, setup } from "xstate";
import { DEFAULT_SYNC_HOST, normalizeHost } from "./config";
import type {
  CheckHealthInput,
  ConsumeExchangeInput,
  DownloadSnapshotInput,
  HealthCheckResult,
  OpenAuthorizationInput,
  RequestPermissionInput,
  UploadBootstrapInput,
  WizardContext,
  WizardEvent,
} from "./types";

/**
 * Wizard state machine (spec §2.4.5).
 *
 * All side effects are injected as actors through `opts.actors` so tests can
 * swap in mocks with `fromPromise(async () => ...)`. The happy path is:
 *
 *   idle → backup_running → backup_done → host_input
 *        → permission_requesting → health_checking
 *        → awaiting_authorization → consuming_exchange
 *        → direction_choice → uploading | downloading → complete
 *
 * Error branches (`health_failed`, `authorization_timeout`,
 * `authorization_denied`, `exchange_invalid`) each support `RETRY` to loop
 * back to the matching pre-error state. `CANCEL` from any non-terminal state
 * returns to `idle` so a freshly-opened wizard never inherits stale context.
 */

// ---------------------------------------------------------------------------
// Actor factories
// ---------------------------------------------------------------------------

/**
 * The actor map the machine expects. Consumers (prod + tests) build this via
 * helper functions so the machine itself doesn't reach out to DOM / chrome.*
 * APIs at module load time.
 */
export interface SetupMachineActors {
  exportBackup: ReturnType<typeof fromPromise<{ filename: string }, unknown>>;
  requestPermission: ReturnType<typeof fromPromise<boolean, RequestPermissionInput>>;
  checkHealth: ReturnType<typeof fromPromise<HealthCheckResult, CheckHealthInput>>;
  openAuthorization: ReturnType<typeof fromPromise<number, OpenAuthorizationInput>>;
  consumeExchange: ReturnType<typeof fromPromise<ExchangeConsumeResponse, ConsumeExchangeInput>>;
  uploadBootstrap: ReturnType<typeof fromPromise<undefined, UploadBootstrapInput>>;
  downloadSnapshot: ReturnType<typeof fromPromise<undefined, DownloadSnapshotInput>>;
}

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

export interface CreateSetupMachineInput {
  deviceName: string;
  platform: string;
  extensionVersion: string;
  deviceId: string;
  hasLocalData: boolean;
  /**
   * Injected so the machine never imports the real sync engine — keeps tests
   * purely in-memory. Task 39 will thread the live engine through.
   */
  syncEngine?: unknown;
  initialHost?: string;
}

function buildInitialContext(input: CreateSetupMachineInput): WizardContext & {
  deviceId: string;
  syncEngine: unknown;
} {
  return {
    deviceName: input.deviceName,
    platform: input.platform,
    extensionVersion: input.extensionVersion,
    deviceId: input.deviceId,
    syncEngine: input.syncEngine ?? null,
    host: normalizeHost(input.initialHost ?? DEFAULT_SYNC_HOST),
    hasLocalData: input.hasLocalData,
    hasServerData: false,
    nonce: null,
    authorizationTabId: null,
    exchangeCode: null,
    exchangeResponse: null,
    healthResult: null,
    backupFilename: null,
    error: null,
    direction: null,
  };
}

// ---------------------------------------------------------------------------
// Machine factory
// ---------------------------------------------------------------------------

export interface CreateSetupMachineOptions {
  actors: SetupMachineActors;
  /** Injected so tests can produce deterministic nonces. */
  generateNonce?: () => string;
}

// Widen context to carry deviceId + syncEngine without exposing them on the
// public `WizardContext` type (which the UI consumes).
type FullContext = WizardContext & { deviceId: string; syncEngine: unknown };

export function createSetupMachine(opts: CreateSetupMachineOptions) {
  const generateNonce = opts.generateNonce ?? defaultGenerateNonce;

  return setup({
    types: {
      context: {} as FullContext,
      events: {} as WizardEvent,
      input: {} as CreateSetupMachineInput,
    },
    actors: {
      exportBackup: opts.actors.exportBackup,
      requestPermission: opts.actors.requestPermission,
      checkHealth: opts.actors.checkHealth,
      openAuthorization: opts.actors.openAuthorization,
      consumeExchange: opts.actors.consumeExchange,
      uploadBootstrap: opts.actors.uploadBootstrap,
      downloadSnapshot: opts.actors.downloadSnapshot,
    },
    actions: {
      resetContext: assign({
        hasServerData: false,
        nonce: null,
        authorizationTabId: null,
        exchangeCode: null,
        exchangeResponse: null,
        healthResult: null,
        backupFilename: null,
        error: null,
        direction: null,
      }),
      mintNonce: assign({ nonce: () => generateNonce() }),
    },
    guards: {
      canUpload: ({ context }) => context.hasLocalData,
      canDownload: ({ context }) => context.hasServerData,
    },
  }).createMachine({
    id: "sync-setup-wizard",
    initial: "idle",
    context: ({ input }) => buildInitialContext(input),
    on: {
      CANCEL: { target: ".idle", actions: "resetContext" },
    },
    states: {
      idle: {
        on: {
          START: { target: "backup_running", actions: "resetContext" },
        },
      },

      backup_running: {
        invoke: {
          src: "exportBackup",
          onDone: {
            target: "backup_done",
            actions: assign({
              backupFilename: ({ event }) => event.output.filename,
            }),
          },
          onError: {
            target: "idle",
            actions: assign({
              error: ({ event }) => String(event.error),
            }),
          },
        },
      },

      backup_done: {
        on: {
          START: { target: "host_input" },
          HOST_SUBMITTED: {
            target: "permission_requesting",
            actions: assign({ host: ({ event }) => normalizeHost(event.host) }),
          },
        },
      },

      host_input: {
        on: {
          HOST_SUBMITTED: {
            target: "permission_requesting",
            actions: assign({ host: ({ event }) => normalizeHost(event.host) }),
          },
        },
      },

      permission_requesting: {
        invoke: {
          src: "requestPermission",
          input: ({ context }) => ({ host: context.host }),
          onDone: [
            { target: "health_checking", guard: ({ event }) => event.output === true },
            { target: "host_input", actions: assign({ error: () => "permission_denied" }) },
          ],
          onError: {
            target: "host_input",
            actions: assign({ error: ({ event }) => String(event.error) }),
          },
        },
        on: {
          PERMISSION_GRANTED: { target: "health_checking" },
          PERMISSION_DENIED: { target: "host_input" },
        },
      },

      health_checking: {
        invoke: {
          src: "checkHealth",
          input: ({ context }) => ({ host: context.host }),
          onDone: [
            {
              target: "awaiting_authorization",
              guard: ({ event }) => event.output.kind === "ok",
              actions: assign({
                healthResult: ({ event }) => event.output,
              }),
            },
            {
              target: "health_recommended_upgrade",
              guard: ({ event }) => event.output.kind === "upgrade_recommended",
              actions: assign({
                healthResult: ({ event }) => event.output,
              }),
            },
            {
              target: "health_failed",
              actions: assign({
                healthResult: ({ event }) => event.output,
              }),
            },
          ],
          onError: {
            target: "health_failed",
            actions: assign({
              healthResult: ({ event }) =>
                ({ kind: "unreachable", error: String(event.error) }) satisfies HealthCheckResult,
            }),
          },
        },
        on: {
          HEALTH_OK: {
            target: "awaiting_authorization",
            actions: assign({
              healthResult: ({ event }) =>
                ({ kind: "ok", response: event.response }) satisfies HealthCheckResult,
            }),
          },
          HEALTH_UPGRADE_RECOMMENDED: {
            target: "health_recommended_upgrade",
            actions: assign({ healthResult: ({ event }) => event.result }),
          },
          HEALTH_FAIL: {
            target: "health_failed",
            actions: assign({ healthResult: ({ event }) => event.result }),
          },
        },
      },

      health_failed: {
        on: {
          RETRY: { target: "health_checking" },
          HOST_SUBMITTED: {
            target: "permission_requesting",
            actions: assign({ host: ({ event }) => normalizeHost(event.host) }),
          },
        },
      },

      health_recommended_upgrade: {
        on: {
          START: { target: "awaiting_authorization" },
          RETRY: { target: "health_checking" },
        },
      },

      awaiting_authorization: {
        entry: "mintNonce",
        invoke: {
          src: "openAuthorization",
          input: ({ context }) => ({
            host: context.host,
            nonce: context.nonce ?? "",
            deviceName: context.deviceName,
            platform: context.platform,
            extensionVersion: context.extensionVersion,
          }),
          onDone: {
            actions: assign({ authorizationTabId: ({ event }) => event.output }),
          },
          onError: {
            target: "authorization_denied",
            actions: assign({ error: ({ event }) => String(event.error) }),
          },
        },
        on: {
          AUTHORIZATION_CALLBACK: {
            target: "consuming_exchange",
            actions: assign({
              exchangeCode: ({ event }) => event.exchangeCode,
              nonce: ({ event }) => event.nonce,
            }),
          },
          AUTHORIZATION_TIMEOUT: { target: "authorization_timeout" },
          AUTHORIZATION_DENIED: {
            target: "authorization_denied",
            actions: assign({ error: ({ event }) => event.error ?? null }),
          },
        },
      },

      authorization_timeout: {
        on: {
          RETRY: { target: "awaiting_authorization" },
        },
      },

      authorization_denied: {
        on: {
          RETRY: { target: "awaiting_authorization" },
        },
      },

      consuming_exchange: {
        invoke: {
          src: "consumeExchange",
          input: ({ context }) => ({
            host: context.host,
            exchangeCode: context.exchangeCode ?? "",
            nonce: context.nonce ?? "",
            deviceId: context.deviceId,
            deviceName: context.deviceName,
            platform: context.platform,
            extensionVersion: context.extensionVersion,
          }),
          onDone: {
            target: "direction_choice",
            actions: assign({
              exchangeResponse: ({ event }) => event.output,
            }),
          },
          onError: {
            target: "exchange_invalid",
            actions: assign({ error: ({ event }) => String(event.error) }),
          },
        },
        on: {
          EXCHANGE_OK: {
            target: "direction_choice",
            actions: assign({ exchangeResponse: ({ event }) => event.response }),
          },
          EXCHANGE_INVALID: {
            target: "exchange_invalid",
            actions: assign({ error: ({ event }) => event.error }),
          },
        },
      },

      exchange_invalid: {
        on: {
          RETRY: { target: "awaiting_authorization" },
          HOST_SUBMITTED: {
            target: "permission_requesting",
            actions: assign({ host: ({ event }) => normalizeHost(event.host) }),
          },
          START: { target: "host_input" },
        },
      },

      direction_choice: {
        on: {
          CHOSE_UPLOAD: {
            target: "uploading",
            guard: "canUpload",
            actions: assign({ direction: () => "upload" as const }),
          },
          CHOSE_DOWNLOAD: {
            target: "downloading",
            guard: "canDownload",
            actions: assign({ direction: () => "download" as const }),
          },
        },
      },

      uploading: {
        invoke: {
          src: "uploadBootstrap",
          input: ({ context }) => ({ syncEngine: context.syncEngine }),
          onDone: { target: "complete" },
          onError: {
            target: "direction_choice",
            actions: assign({ error: ({ event }) => String(event.error) }),
          },
        },
        on: {
          UPLOAD_DONE: { target: "complete" },
        },
      },

      downloading: {
        invoke: {
          src: "downloadSnapshot",
          input: ({ context }) => ({ syncEngine: context.syncEngine }),
          onDone: { target: "complete" },
          onError: {
            target: "direction_choice",
            actions: assign({ error: ({ event }) => String(event.error) }),
          },
        },
        on: {
          DOWNLOAD_DONE: { target: "complete" },
        },
      },

      complete: {
        type: "final",
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Default nonce generator. Uses `crypto.randomUUID` where available (Chrome
 * service worker + content + popup contexts all have it), falling back to a
 * time+random hybrid for older test runners.
 */
function defaultGenerateNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `nonce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Re-exported for tests that want to stub out the actor map with no-op
 * promises. Returns a resolved-immediately actor map suitable for happy-path
 * transition testing.
 */
export function createNoopActors(): SetupMachineActors {
  return {
    exportBackup: fromPromise(async () => ({ filename: "backup.json" })),
    requestPermission: fromPromise(async () => true),
    checkHealth: fromPromise<HealthCheckResult, CheckHealthInput>(async () => ({
      kind: "ok",
      response: {
        serverVersion: "1.0.0",
        protocolVersion: "1.0.0",
        minSupportedProtocolVersion: "1.0.0",
        minSupportedExtensionVersion: "0.0.1",
        recommendedExtensionVersion: null,
        serverTime: Date.now(),
        timezone: "UTC",
      },
    })),
    openAuthorization: fromPromise(async () => 1),
    consumeExchange: fromPromise<ExchangeConsumeResponse, ConsumeExchangeInput>(async () => ({
      deviceId: "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc",
      deviceToken: "tok",
      deviceName: "Chrome",
      user: { id: "u1", email: "u@example.com", name: null },
    })),
    uploadBootstrap: fromPromise<undefined, UploadBootstrapInput>(async () => undefined),
    downloadSnapshot: fromPromise<undefined, DownloadSnapshotInput>(async () => undefined),
  };
}

// Keep HealthResponse importable for consumers that stub the health actor.
export type { HealthResponse };
