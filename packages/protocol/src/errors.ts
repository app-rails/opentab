/**
 * Terminal sync error codes shared across server response bodies and
 * extension-side error narrowing. Kept as a `const` record instead of a TS
 * enum so the wire format is plain JSON strings without any runtime enum
 * machinery.
 */
export const SyncErrorCode = {
  API_VERSION_MISMATCH: "API_VERSION_MISMATCH",
  UNAUTHORIZED: "UNAUTHORIZED",
  DEVICE_NOT_REGISTERED: "DEVICE_NOT_REGISTERED",
  EXCHANGE_INVALID: "EXCHANGE_INVALID",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  SYNC_ID_MISMATCH: "SYNC_ID_MISMATCH",
  PARENT_NOT_FOUND: "PARENT_NOT_FOUND",
  CROSS_USER_REFERENCE: "CROSS_USER_REFERENCE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;

export type SyncErrorCode = (typeof SyncErrorCode)[keyof typeof SyncErrorCode];
