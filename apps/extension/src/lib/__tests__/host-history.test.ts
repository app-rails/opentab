import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type HostEntry, pushHost, removeHost } from "@/lib/host-history";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pushHost", () => {
  it("adds a single entry to an empty history", () => {
    const result = pushHost([], "https://a.example.com");
    expect(result).toEqual([{ host: "https://a.example.com", lastUsedAt: Date.now() }]);
  });

  it("dedupes by host string and refreshes lastUsedAt", () => {
    const initial: HostEntry[] = [{ host: "https://a.example.com", lastUsedAt: 1_000 }];
    const result = pushHost(initial, "https://a.example.com");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ host: "https://a.example.com", lastUsedAt: Date.now() });
  });

  it("keeps at most 5 entries, dropping the oldest when adding a 6th", () => {
    const initial: HostEntry[] = [
      { host: "https://e.example.com", lastUsedAt: 5_000 },
      { host: "https://d.example.com", lastUsedAt: 4_000 },
      { host: "https://c.example.com", lastUsedAt: 3_000 },
      { host: "https://b.example.com", lastUsedAt: 2_000 },
      { host: "https://a.example.com", lastUsedAt: 1_000 },
    ];
    const result = pushHost(initial, "https://new.example.com");
    expect(result).toHaveLength(5);
    expect(result.map((e) => e.host)).toEqual([
      "https://new.example.com",
      "https://e.example.com",
      "https://d.example.com",
      "https://c.example.com",
      "https://b.example.com",
    ]);
  });

  it("returns entries sorted by lastUsedAt desc", () => {
    const initial: HostEntry[] = [
      { host: "https://a.example.com", lastUsedAt: 1_000 },
      { host: "https://b.example.com", lastUsedAt: 3_000 },
      { host: "https://c.example.com", lastUsedAt: 2_000 },
    ];
    const result = pushHost(initial, "https://d.example.com");
    const sorted = [...result].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    expect(result).toEqual(sorted);
    expect(result[0]?.host).toBe("https://d.example.com");
  });

  it("returns a new array; does not mutate input", () => {
    const initial: HostEntry[] = [{ host: "https://a.example.com", lastUsedAt: 1_000 }];
    const snapshot = [...initial];
    const result = pushHost(initial, "https://b.example.com");
    expect(initial).toEqual(snapshot);
    expect(result).not.toBe(initial);
  });
});

describe("removeHost", () => {
  it("removes the matching host", () => {
    const initial: HostEntry[] = [
      { host: "https://a.example.com", lastUsedAt: 1_000 },
      { host: "https://b.example.com", lastUsedAt: 2_000 },
    ];
    const result = removeHost(initial, "https://a.example.com");
    expect(result).toEqual([{ host: "https://b.example.com", lastUsedAt: 2_000 }]);
  });

  it("is a no-op when the host is not present", () => {
    const initial: HostEntry[] = [{ host: "https://a.example.com", lastUsedAt: 1_000 }];
    const result = removeHost(initial, "https://missing.example.com");
    expect(result).toEqual(initial);
  });

  it("returns a new array; does not mutate input", () => {
    const initial: HostEntry[] = [
      { host: "https://a.example.com", lastUsedAt: 1_000 },
      { host: "https://b.example.com", lastUsedAt: 2_000 },
    ];
    const snapshot = [...initial];
    const result = removeHost(initial, "https://a.example.com");
    expect(initial).toEqual(snapshot);
    expect(result).not.toBe(initial);
  });
});
