import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleCallback,
  PENDING_CALLBACK_STORAGE_KEY,
  parseCallbackParams,
} from "@/entrypoints/setup-callback/main";
import { MSG } from "@/lib/constants";

type StorageRecord = Record<string, unknown>;

function installChromeMock(): {
  store: StorageRecord;
  storageSet: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  tabsGetCurrent: ReturnType<typeof vi.fn>;
  tabsRemove: ReturnType<typeof vi.fn>;
} {
  const store: StorageRecord = {};
  const storageSet = vi.fn(async (entries: StorageRecord) => {
    Object.assign(store, entries);
  });
  const sendMessage = vi.fn(async () => undefined);
  const tabsGetCurrent = vi.fn(async () => ({ id: 42 }));
  const tabsRemove = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    storage: { local: { set: storageSet } },
    runtime: { sendMessage },
    tabs: { getCurrent: tabsGetCurrent, remove: tabsRemove },
  });
  return { store, storageSet, sendMessage, tabsGetCurrent, tabsRemove };
}

function buildDom(): void {
  document.body.replaceChildren();
  const h1 = document.createElement("h1");
  h1.id = "headline";
  h1.textContent = "Authorization complete";
  const p = document.createElement("p");
  p.id = "detail";
  p.textContent = "Closing this tab…";
  document.body.append(h1, p);
}

beforeEach(() => {
  vi.clearAllMocks();
  buildDom();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseCallbackParams", () => {
  it("pulls exchange_code, nonce, error out of a query string", () => {
    const parsed = parseCallbackParams(
      "?exchange_code=abc&nonce=xyz&error=access_denied&extra=ignored",
    );
    expect(parsed).toEqual({ exchangeCode: "abc", nonce: "xyz", error: "access_denied" });
  });

  it("returns nulls when fields are absent", () => {
    expect(parseCallbackParams("")).toEqual({
      exchangeCode: null,
      nonce: null,
      error: null,
    });
  });
});

describe("handleCallback — success path", () => {
  it("writes a durable record and fires a runtime message", async () => {
    const { store, storageSet, sendMessage } = installChromeMock();

    await handleCallback("?exchange_code=abc123&nonce=n-1", 1700000000000);

    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(store[PENDING_CALLBACK_STORAGE_KEY]).toEqual({
      exchangeCode: "abc123",
      nonce: "n-1",
      error: null,
      receivedAt: 1700000000000,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: MSG.SYNC_SETUP_CALLBACK,
      payload: {
        exchangeCode: "abc123",
        nonce: "n-1",
        error: null,
        receivedAt: 1700000000000,
      },
    });
  });
});

describe("handleCallback — error path", () => {
  it("writes the error field and still broadcasts SYNC_SETUP_CALLBACK", async () => {
    const { store, storageSet, sendMessage } = installChromeMock();

    await handleCallback("?error=access_denied", 1700000000001);

    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(store[PENDING_CALLBACK_STORAGE_KEY]).toEqual({
      exchangeCode: null,
      nonce: null,
      error: "access_denied",
      receivedAt: 1700000000001,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: MSG.SYNC_SETUP_CALLBACK,
      payload: {
        exchangeCode: null,
        nonce: null,
        error: "access_denied",
        receivedAt: 1700000000001,
      },
    });
  });

  it("updates the DOM copy when an error is present", async () => {
    installChromeMock();

    await handleCallback("?error=access_denied");

    expect(document.getElementById("headline")?.textContent).toBe("Authorization failed");
    expect(document.getElementById("detail")?.textContent).toContain("try again");
  });
});

describe("handleCallback — missing fields", () => {
  it("does not crash and still writes a record with all-null fields", async () => {
    const { store, storageSet, sendMessage } = installChromeMock();

    await expect(handleCallback("", 1700000000002)).resolves.toBeUndefined();

    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(store[PENDING_CALLBACK_STORAGE_KEY]).toEqual({
      exchangeCode: null,
      nonce: null,
      error: null,
      receivedAt: 1700000000002,
    });
    expect(sendMessage).toHaveBeenCalled();
  });
});

describe("handleCallback — runtime message failure is swallowed", () => {
  it("resolves even when sendMessage rejects (no listener)", async () => {
    installChromeMock();
    // biome-ignore lint/suspicious/noExplicitAny: swapping the mock for this case
    (chrome.runtime.sendMessage as any) = vi.fn(async () => {
      throw new Error("Could not establish connection");
    });

    await expect(handleCallback("?exchange_code=ok&nonce=n")).resolves.toBeUndefined();
  });
});
