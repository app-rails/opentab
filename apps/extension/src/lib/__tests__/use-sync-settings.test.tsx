import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYNC_SETTINGS_STORAGE_KEY, type SyncSettings } from "@/lib/sync-settings";
import { useSyncSettings } from "@/lib/use-sync-settings";
import { installChromeStorageMock } from "@/test/chrome-storage-mock";

const STORED: SyncSettings = {
  enabled: true,
  savedConfig: { host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 },
  auth: null,
  hostHistory: [{ host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 }],
};

let mock: ReturnType<typeof installChromeStorageMock>;

beforeEach(() => {
  mock = installChromeStorageMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSyncSettings", () => {
  it("returns defaults synchronously, then loads stored value asynchronously", async () => {
    mock.store[SYNC_SETTINGS_STORAGE_KEY] = STORED;

    const { result } = renderHook(() => useSyncSettings());

    // Synchronous initial render: defaults (enabled=false, no host).
    expect(result.current.enabled).toBe(false);
    expect(result.current.savedConfig).toBeNull();
    expect(result.current.auth).toBeNull();
    expect(result.current.hostHistory).toEqual([]);

    // After the async getSyncSettings resolves, the stored value lands.
    await waitFor(() => {
      expect(result.current).toEqual(STORED);
    });
  });

  it("rerenders when chrome.storage.onChanged fires for SYNC_SETTINGS_STORAGE_KEY", async () => {
    const { result } = renderHook(() => useSyncSettings());

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
    });

    await act(async () => {
      await chrome.storage.local.set({ [SYNC_SETTINGS_STORAGE_KEY]: STORED });
    });

    await waitFor(() => {
      expect(result.current).toEqual(STORED);
    });
  });

  it("ignores onChanged for unrelated keys", async () => {
    const { result } = renderHook(() => useSyncSettings());

    // Let the initial async load resolve so subsequent renders are only driven
    // by listener fires (not the in-flight initial fetch).
    await waitFor(() => {
      expect(mock.get).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const before = result.current;
    mock.get.mockClear();

    await act(async () => {
      await chrome.storage.local.set({ some_other_key: { foo: "bar" } });
    });

    // Same reference (no rerender path through getSyncSettings) and no extra reads.
    expect(result.current).toBe(before);
    expect(mock.get).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useSyncSettings());
    expect(mock.addListener).toHaveBeenCalledTimes(1);
    const listener = mock.addListener.mock.calls[0][0];

    unmount();

    expect(mock.removeListener).toHaveBeenCalledTimes(1);
    expect(mock.removeListener).toHaveBeenCalledWith(listener);
  });
});
