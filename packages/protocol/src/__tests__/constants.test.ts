import { describe, expect, it } from "vitest";
import {
  MAX_BATCH_SIZE,
  NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  URL_MAX_LENGTH,
  UUID_V7_REGEX,
} from "../constants";
import { MIN_SERVER_PROTOCOL_VERSION, PROTOCOL_VERSION } from "../version";

describe("UUID_V7_REGEX", () => {
  it("matches valid UUID v7 strings", () => {
    // Version nibble (13th hex digit) is 7, variant nibble (17th hex digit) is 8/9/a/b.
    const samples = [
      "018f1a2b-3c4d-7abc-8def-0123456789ab",
      "01900000-0000-7000-8000-000000000000",
      "01ffffff-ffff-7fff-bfff-ffffffffffff",
      "018abcde-0123-7456-9789-abcdef012345",
    ];
    for (const s of samples) {
      expect(UUID_V7_REGEX.test(s)).toBe(true);
    }
  });

  it("rejects UUID v4 strings", () => {
    // Standard v4 has version nibble = 4.
    const v4 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    expect(UUID_V7_REGEX.test(v4)).toBe(false);
  });

  it("rejects malformed UUIDs", () => {
    const bad = [
      "not-a-uuid",
      "018f1a2b-3c4d-7abc-8def-0123456789ab-extra",
      "018f1a2b-3c4d-7abc-cdef-0123456789ab", // variant nibble = c (invalid)
      "018f1a2b-3c4d-8abc-8def-0123456789ab", // version nibble = 8 (invalid)
      "018f1a2b3c4d7abc8def0123456789ab", // missing hyphens
      "",
    ];
    for (const s of bad) {
      expect(UUID_V7_REGEX.test(s)).toBe(false);
    }
  });

  it("rejects too-short strings", () => {
    expect(UUID_V7_REGEX.test("018f1a2b-3c4d-7abc-8def-0123456789a")).toBe(false);
    expect(UUID_V7_REGEX.test("short")).toBe(false);
  });
});

describe("protocol constants", () => {
  it("has MAX_BATCH_SIZE = 100", () => {
    expect(MAX_BATCH_SIZE).toBe(100);
  });

  it("has payload length limits matching spec §2.3", () => {
    expect(URL_MAX_LENGTH).toBe(500);
    expect(TITLE_MAX_LENGTH).toBe(500);
    expect(NAME_MAX_LENGTH).toBe(100);
  });
});

describe("protocol version", () => {
  it("equals 1.0.0 (matches package.json.version)", () => {
    expect(PROTOCOL_VERSION).toBe("1.0.0");
  });

  it("exports MIN_SERVER_PROTOCOL_VERSION = 1.0.0", () => {
    expect(MIN_SERVER_PROTOCOL_VERSION).toBe("1.0.0");
  });
});
