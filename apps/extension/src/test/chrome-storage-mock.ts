/**
 * Test helper that installs a minimal in-memory `chrome.storage.local` API on
 * `globalThis.chrome` for vitest (jsdom) suites. Used by sync-settings tests
 * and the broader Phase 1 sync code that touches chrome.storage.
 *
 * Also mounts a `chrome.storage.onChanged` event surface (addListener /
 * removeListener) so hooks that subscribe for cross-context updates can be
 * exercised without a real extension runtime. Set/remove fan out a synthetic
 * `StorageChange` payload that mirrors Chrome's behavior closely enough for
 * unit tests.
 *
 * Each call wipes any previously installed mock; `reset()` empties the backing
 * store so suites can share one install across multiple `it` blocks.
 */
import { vi } from "vitest";

type StorageRecord = Record<string, unknown>;
type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

export interface ChromeStorageMock {
  store: StorageRecord;
  reset: () => void;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

export function installChromeStorageMock(initial: StorageRecord = {}): ChromeStorageMock {
  const store: StorageRecord = { ...initial };
  const listeners = new Set<ChangeListener>();

  const fire = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => {
    for (const listener of listeners) listener(changes, "local");
  };

  const get = vi.fn(async (key?: string | string[] | null) => {
    if (key === undefined || key === null) return { ...store };
    if (Array.isArray(key)) {
      const out: StorageRecord = {};
      for (const k of key) if (k in store) out[k] = store[k];
      return out;
    }
    return key in store ? { [key]: store[key] } : {};
  });

  const set = vi.fn(async (entries: StorageRecord) => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const [k, v] of Object.entries(entries)) {
      changes[k] = { oldValue: store[k], newValue: v };
      store[k] = v;
    }
    fire(changes);
  });

  const remove = vi.fn(async (key: string | string[]) => {
    const keys = Array.isArray(key) ? key : [key];
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const k of keys) {
      if (k in store) {
        changes[k] = { oldValue: store[k], newValue: undefined };
        delete store[k];
      }
    }
    fire(changes);
  });

  const addListener = vi.fn((listener: ChangeListener) => listeners.add(listener));
  const removeListener = vi.fn((listener: ChangeListener) => listeners.delete(listener));

  vi.stubGlobal("chrome", {
    storage: {
      local: { get, set, remove },
      onChanged: { addListener, removeListener },
    },
  });

  const reset = () => {
    for (const k of Object.keys(store)) delete store[k];
    listeners.clear();
    get.mockClear();
    set.mockClear();
    remove.mockClear();
    addListener.mockClear();
    removeListener.mockClear();
  };

  return { store, reset, get, set, remove, addListener, removeListener };
}
