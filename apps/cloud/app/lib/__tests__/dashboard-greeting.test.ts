import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardGreeting } from "../dashboard-greeting";

describe("dashboardGreeting", () => {
  const NOW = Date.UTC(2026, 3, 26, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("greets a named user with workspace count and last sync", () => {
    const result = dashboardGreeting({
      name: "Liang",
      workspaceCount: 3,
      lastSyncedAt: NOW - 2 * 3600 * 1000,
    });
    expect(result.title).toBe("Welcome back, Liang");
    expect(result.subtitle).toMatch(/3 workspaces · synced 2 hours? ago/);
  });

  it("omits the comma when no name is provided", () => {
    const result = dashboardGreeting({
      workspaceCount: 3,
      lastSyncedAt: NOW - 2 * 3600 * 1000,
    });
    expect(result.title).toBe("Welcome back");
  });

  it("treats an empty-string name as missing", () => {
    const result = dashboardGreeting({
      name: "",
      workspaceCount: 3,
      lastSyncedAt: NOW - 2 * 3600 * 1000,
    });
    expect(result.title).toBe("Welcome back");
  });

  it("uses an empty-state subtitle when workspaceCount is 0", () => {
    const result = dashboardGreeting({
      name: "Liang",
      workspaceCount: 0,
      lastSyncedAt: NOW - 2 * 3600 * 1000,
    });
    expect(result.subtitle).toBe("No workspaces synced yet");
  });

  it("drops the synced suffix when lastSyncedAt is missing", () => {
    const result = dashboardGreeting({ name: "Liang", workspaceCount: 3 });
    expect(result.subtitle).toBe("3 workspaces");
    expect(result.subtitle).not.toContain("synced");
  });

  it("singularizes 'workspace' when count is 1", () => {
    const result = dashboardGreeting({ name: "Liang", workspaceCount: 1 });
    expect(result.subtitle).toBe("1 workspace");
  });
});
