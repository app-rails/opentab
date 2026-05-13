import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyActiveWorkspaceFromBroadcast = vi.fn();

vi.mock("@/stores/app-store", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ applyActiveWorkspaceFromBroadcast }),
}));

type Listener = (msg: { type: string; workspaceId?: number | null }) => void;
const listeners: Listener[] = [];

beforeEach(() => {
  applyActiveWorkspaceFromBroadcast.mockClear();
  listeners.length = 0;
  // Minimal chrome stub for tests — cast through unknown to avoid pulling in
  // the full Event interface (getRules, hasListeners, etc.).
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener: (l: Listener) => {
          listeners.push(l);
        },
        removeListener: (l: Listener) => {
          const i = listeners.indexOf(l);
          if (i !== -1) listeners.splice(i, 1);
        },
      },
    },
  } as unknown as typeof chrome;
});

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = undefined;
});

import { useWorkspaceSync } from "@/hooks/use-workspace-sync";

describe("useWorkspaceSync", () => {
  it("applies workspaceId when WORKSPACE_CHANGED broadcast arrives", () => {
    renderHook(() => useWorkspaceSync());
    listeners[0]({ type: "WORKSPACE_CHANGED", workspaceId: 42 });
    expect(applyActiveWorkspaceFromBroadcast).toHaveBeenCalledWith(42);
  });

  it("ignores unrelated messages", () => {
    renderHook(() => useWorkspaceSync());
    listeners[0]({ type: "SYNC_APPLIED" });
    expect(applyActiveWorkspaceFromBroadcast).not.toHaveBeenCalled();
  });

  it("passes null workspaceId through (e.g. last workspace deleted)", () => {
    renderHook(() => useWorkspaceSync());
    listeners[0]({ type: "WORKSPACE_CHANGED", workspaceId: null });
    expect(applyActiveWorkspaceFromBroadcast).toHaveBeenCalledWith(null);
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useWorkspaceSync());
    expect(listeners.length).toBe(1);
    unmount();
    expect(listeners.length).toBe(0);
  });
});
