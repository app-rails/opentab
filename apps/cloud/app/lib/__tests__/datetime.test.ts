import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeFromNow } from "../datetime";

describe("formatRelativeFromNow", () => {
  const NOW = Date.UTC(2026, 3, 26, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats a 2-hour-old timestamp as '2 hours ago'", () => {
    const result = formatRelativeFromNow(NOW - 2 * 3600 * 1000);
    expect(result).toMatch(/2 hours? ago/);
  });

  it("formats a 30-second-old timestamp as 'now' or seconds", () => {
    const result = formatRelativeFromNow(NOW - 30 * 1000);
    // numeric: "auto" turns small diffs into "now"; "always" yields "30 seconds ago"
    expect(result).toMatch(/now|second/);
  });

  it("formats a 7-day-old timestamp using the day unit", () => {
    const result = formatRelativeFromNow(NOW - 7 * 24 * 3600 * 1000);
    expect(result).toMatch(/7 days? ago|1 week ago/);
  });

  it("formats a future timestamp with future tense", () => {
    const result = formatRelativeFromNow(NOW + 3 * 3600 * 1000);
    expect(result).toMatch(/in 3 hours?/);
  });

  it("uses month unit for ~2 month diffs", () => {
    const result = formatRelativeFromNow(NOW - 60 * 24 * 3600 * 1000);
    expect(result).toMatch(/2 months? ago/);
  });

  it("uses year unit for ~2 year diffs", () => {
    const result = formatRelativeFromNow(NOW - 2 * 365 * 24 * 3600 * 1000);
    expect(result).toMatch(/2 years? ago/);
  });
});
