// Strict UUID v7 regex.
// Version nibble must be 7; variant nibble must be 8/9/a/b (RFC 4122 DCE).
export const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Maximum number of ops the server accepts in a single push batch,
// and maximum number of changes returned per pull page.
export const MAX_BATCH_SIZE = 100;

// Payload length limits (see spec §2.3).
export const URL_MAX_LENGTH = 500;
export const TITLE_MAX_LENGTH = 500;
export const NAME_MAX_LENGTH = 100;
