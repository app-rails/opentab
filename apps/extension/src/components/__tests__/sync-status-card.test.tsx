import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The card reads two things: lastSyncAt (from db.syncMeta) and pending op
// count (from db.syncOutbox). The earlier version pulled lastSync from
// chrome.storage.local under a key the engine never writes — so it would
// always render "Not yet synced". The mocks below let us assert the read
// actually goes to db.syncMeta.
const syncMetaGet = vi.fn();
const syncOutboxCount = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    syncMeta: {
      get: (key: string) => syncMetaGet(key),
    },
    syncOutbox: {
      where: () => ({
        equals: () => ({
          count: () => syncOutboxCount(),
        }),
      }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  syncMetaGet.mockResolvedValue(undefined);
  syncOutboxCount.mockResolvedValue(0);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function loadComponent() {
  const mod = await import("@/components/settings/sync-status-card");
  return mod.SyncStatusCard;
}

const AUTH = {
  kind: "authenticated" as const,
  host: "https://sync.example.com",
  deviceId: "018f-aaaa",
  deviceToken: "tok",
  deviceName: "Chrome on macOS",
};

describe("SyncStatusCard", () => {
  it("renders the lastSyncAt timestamp from db.syncMeta (not chrome.storage)", async () => {
    syncMetaGet.mockResolvedValueOnce({
      key: "lastSyncAt",
      value: new Date("2026-04-26T10:30:00Z").getTime(),
    });
    syncOutboxCount.mockResolvedValueOnce(7);

    const SyncStatusCard = await loadComponent();
    render(<SyncStatusCard auth={AUTH} />);

    // Pending count proves db.syncOutbox is the source.
    await waitFor(() => expect(screen.getByText("7")).toBeTruthy());
    // "Last sync" must NOT show the placeholder; it should render a date string.
    await waitFor(() => expect(screen.queryByText("Not yet synced")).toBeNull());
    expect(syncMetaGet).toHaveBeenCalledWith("lastSyncAt");
  });

  it("renders 'Not yet synced' only when db.syncMeta has no lastSyncAt", async () => {
    syncMetaGet.mockResolvedValueOnce(undefined);
    syncOutboxCount.mockResolvedValueOnce(0);

    const SyncStatusCard = await loadComponent();
    render(<SyncStatusCard auth={AUTH} />);

    await waitFor(() => expect(screen.getByText("Not yet synced")).toBeTruthy());
  });
});
