import type { ExchangeConsumeResponse, HealthResponse } from "@opentab/protocol";

/**
 * Wizard machine types (spec §2.4.5).
 *
 * Kept as plain discriminated unions so tests and the UI (`useSelector`) can
 * pattern-match on `state.value` and `event.type` without poking at XState
 * internals.
 */

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export type HealthCheckResult =
  | { kind: "ok"; response: HealthResponse }
  | { kind: "server_too_old"; serverProtocol: string }
  | { kind: "unreachable"; error: string };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type WizardDirection = "upload" | "download";

export interface WizardContext {
  /** Pretty name the server shows on its device list. */
  deviceName: string;
  /** OS-ish identifier we forward to the server. */
  platform: string;
  /** Extension manifest version. */
  extensionVersion: string;
  /** User-entered sync host; starts at `DEFAULT_SYNC_HOST`. */
  host: string;
  /** True once the wizard has observed at least one local workspace. */
  hasLocalData: boolean;
  /**
   * True when the server snapshot advertises non-empty data (set by a later
   * API call outside this machine — wizard UI is responsible for populating
   * before entering `direction_choice`).
   */
  hasServerData: boolean;
  /** Opaque nonce minted before opening the authorization tab. */
  nonce: string | null;
  /** Chrome tab id of the authorization popup, so we can close it on cancel. */
  authorizationTabId: number | null;
  /** The exchange_code the callback bridge hands back. */
  exchangeCode: string | null;
  /** Server's response to `POST /api/extension/exchange/consume`. */
  exchangeResponse: ExchangeConsumeResponse | null;
  /** Last health-check snapshot — the UI renders version mismatch details. */
  healthResult: HealthCheckResult | null;
  /** Downloads-API filename, populated after the pre-flight backup. */
  backupFilename: string | null;
  /** Freeform description of the most recent error, for UI display. */
  error: string | null;
  /** Which direction the user picked at the fork. */
  direction: WizardDirection | null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type WizardEvent =
  | { type: "START" }
  | { type: "HOST_SUBMITTED"; host: string }
  | { type: "PERMISSION_GRANTED" }
  | { type: "PERMISSION_DENIED" }
  | { type: "HEALTH_OK"; response: HealthResponse }
  | { type: "HEALTH_FAIL"; result: HealthCheckResult }
  | { type: "AUTHORIZATION_CALLBACK"; exchangeCode: string; nonce: string }
  | { type: "AUTHORIZATION_TIMEOUT" }
  | { type: "AUTHORIZATION_DENIED"; error?: string }
  | { type: "EXCHANGE_OK"; response: ExchangeConsumeResponse }
  | { type: "EXCHANGE_INVALID"; error: string }
  | { type: "CHOSE_UPLOAD" }
  | { type: "CHOSE_DOWNLOAD" }
  | { type: "UPLOAD_PROGRESS"; pct: number }
  | { type: "UPLOAD_DONE" }
  | { type: "DOWNLOAD_PROGRESS"; pct: number }
  | { type: "DOWNLOAD_DONE" }
  | { type: "CANCEL" }
  | { type: "RETRY" };

// ---------------------------------------------------------------------------
// State values (informational; XState infers them from the machine config).
// The union is used by UI code that wants a finite state enum.
// ---------------------------------------------------------------------------

export type WizardStateValue =
  | "idle"
  | "backup_running"
  | "backup_done"
  | "host_input"
  | "permission_requesting"
  | "health_checking"
  | "health_failed"
  | "awaiting_authorization"
  | "authorization_timeout"
  | "authorization_denied"
  | "consuming_exchange"
  | "exchange_invalid"
  | "direction_choice"
  | "uploading"
  | "downloading"
  | "complete";

// ---------------------------------------------------------------------------
// Actor input/output shapes (for the injected async actors).
// ---------------------------------------------------------------------------

export interface RequestPermissionInput {
  host: string;
}

export interface CheckHealthInput {
  host: string;
}

export interface OpenAuthorizationInput {
  host: string;
  nonce: string;
  deviceName: string;
  platform: string;
  extensionVersion: string;
}

export interface ConsumeExchangeInput {
  host: string;
  exchangeCode: string;
  nonce: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  extensionVersion: string;
}

export interface UploadBootstrapInput {
  // Opaque — Task 39 wires the real sync engine through.
  // biome-ignore lint/suspicious/noExplicitAny: intentional shim; real type lands with Task 39.
  syncEngine: any;
}

export interface DownloadSnapshotInput {
  // biome-ignore lint/suspicious/noExplicitAny: same shim as above.
  syncEngine: any;
}
