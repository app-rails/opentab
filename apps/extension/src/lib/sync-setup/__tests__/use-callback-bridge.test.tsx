import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SetupCallbackPayload } from "@/entrypoints/setup-callback/main";
import { PENDING_CALLBACK_STORAGE_KEY } from "@/entrypoints/setup-callback/main";
import { MSG } from "@/lib/constants";
import { useSetupCallbackBridge } from "@/lib/sync-setup/use-callback-bridge";

/**
 * Tests for the wizard's runtime-message + storage-sweep bridge to the
 * setup-callback tab.
 */

type MessageListener = (msg: unknown) => void;

interface ChromeMock {
  listeners: MessageListener[];
  storage: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function installChromeMock(initial: Record<string, unknown> = {}): ChromeMock {
  const listeners: MessageListener[] = [];
  const storage: Record<string, unknown> = { ...initial };

  const get = vi.fn(async (key: string) => {
    return key in storage ? { [key]: storage[key] } : {};
  });
  const remove = vi.fn(async (key: string) => {
    delete storage[key];
  });

  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: (fn: MessageListener) => {
          listeners.push(fn);
        },
        removeListener: (fn: MessageListener) => {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      },
    },
    storage: {
      local: { get, remove },
    },
  });

  return { listeners, storage, get, remove };
}

function Harness({ onCallback }: { onCallback: (payload: SetupCallbackPayload) => void }) {
  useSetupCallbackBridge(onCallback);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSetupCallbackBridge — runtime message path", () => {
  it("invokes the callback when a SYNC_SETUP_CALLBACK message arrives", async () => {
    const chromeMock = installChromeMock();
    const onCallback = vi.fn();
    render(<Harness onCallback={onCallback} />);

    // Wait for the storage sweep to settle (no-op in this case).
    await waitFor(() => expect(chromeMock.get).toHaveBeenCalled());

    const payload: SetupCallbackPayload = {
      exchangeCode: "code-1",
      nonce: "nonce-1",
      error: null,
      receivedAt: Date.now(),
    };
    expect(chromeMock.listeners.length).toBeGreaterThan(0);
    for (const listener of chromeMock.listeners) {
      listener({ type: MSG.SYNC_SETUP_CALLBACK, payload });
    }

    expect(onCallback).toHaveBeenCalledTimes(1);
    expect(onCallback).toHaveBeenCalledWith(payload);
    // Runtime path should eagerly clear the durable record.
    expect(chromeMock.remove).toHaveBeenCalledWith(PENDING_CALLBACK_STORAGE_KEY);
  });

  it("ignores unrelated runtime messages", async () => {
    const chromeMock = installChromeMock();
    const onCallback = vi.fn();
    render(<Harness onCallback={onCallback} />);

    await waitFor(() => expect(chromeMock.get).toHaveBeenCalled());

    for (const listener of chromeMock.listeners) {
      listener({ type: "UNRELATED", payload: { foo: "bar" } });
    }

    expect(onCallback).not.toHaveBeenCalled();
  });
});

describe("useSetupCallbackBridge — storage sweep path", () => {
  it("delivers a fresh pending payload on mount", async () => {
    const fresh: SetupCallbackPayload = {
      exchangeCode: "code-2",
      nonce: "nonce-2",
      error: null,
      receivedAt: Date.now(),
    };
    const chromeMock = installChromeMock({ [PENDING_CALLBACK_STORAGE_KEY]: fresh });
    const onCallback = vi.fn();

    render(<Harness onCallback={onCallback} />);

    await waitFor(() => expect(onCallback).toHaveBeenCalledTimes(1));
    expect(onCallback).toHaveBeenCalledWith(fresh);
    expect(chromeMock.remove).toHaveBeenCalledWith(PENDING_CALLBACK_STORAGE_KEY);
  });

  it("discards stale (> 10 min) payloads without invoking the callback", async () => {
    const stale: SetupCallbackPayload = {
      exchangeCode: "code-3",
      nonce: "nonce-3",
      error: null,
      receivedAt: Date.now() - 11 * 60 * 1000,
    };
    const chromeMock = installChromeMock({ [PENDING_CALLBACK_STORAGE_KEY]: stale });
    const onCallback = vi.fn();

    render(<Harness onCallback={onCallback} />);

    await waitFor(() => expect(chromeMock.remove).toHaveBeenCalled());
    expect(onCallback).not.toHaveBeenCalled();
  });

  it("does not double-deliver when both paths fire for the same payload", async () => {
    const payload: SetupCallbackPayload = {
      exchangeCode: "code-4",
      nonce: "nonce-4",
      error: null,
      receivedAt: Date.now(),
    };
    const chromeMock = installChromeMock({ [PENDING_CALLBACK_STORAGE_KEY]: payload });
    const onCallback = vi.fn();

    render(<Harness onCallback={onCallback} />);

    // Storage sweep fires once.
    await waitFor(() => expect(onCallback).toHaveBeenCalledTimes(1));

    // A concurrent runtime message with the identical payload should be
    // deduped (same exchangeCode + nonce + receivedAt).
    for (const listener of chromeMock.listeners) {
      listener({ type: MSG.SYNC_SETUP_CALLBACK, payload });
    }
    expect(onCallback).toHaveBeenCalledTimes(1);
  });

  it("delivers distinct payloads independently", async () => {
    const chromeMock = installChromeMock();
    const onCallback = vi.fn();
    render(<Harness onCallback={onCallback} />);

    await waitFor(() => expect(chromeMock.get).toHaveBeenCalled());

    const first: SetupCallbackPayload = {
      exchangeCode: "code-5a",
      nonce: "nonce-5a",
      error: null,
      receivedAt: Date.now(),
    };
    const second: SetupCallbackPayload = {
      exchangeCode: "code-5b",
      nonce: "nonce-5b",
      error: null,
      receivedAt: Date.now() + 1,
    };

    for (const listener of chromeMock.listeners) {
      listener({ type: MSG.SYNC_SETUP_CALLBACK, payload: first });
      listener({ type: MSG.SYNC_SETUP_CALLBACK, payload: second });
    }
    expect(onCallback).toHaveBeenCalledTimes(2);
  });
});
