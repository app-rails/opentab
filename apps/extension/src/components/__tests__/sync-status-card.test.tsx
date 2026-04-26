import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MSG } from "@/lib/constants";

// Stub useTranslation: t(key, vars) → key with interpolation echoed back so
// "{{count}}" appears in the rendered output. Lets the assertions match
// against the i18n key (which is stable across English/Chinese) instead of
// a literal English string.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (!vars) return key;
      const parts = Object.entries(vars).map(([k, v]) => `${k}=${String(v)}`);
      return `${key}(${parts.join(",")})`;
    },
  }),
}));

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

const sendMessage = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  syncMetaGet.mockResolvedValue(undefined);
  syncOutboxCount.mockResolvedValue(0);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (msg: unknown) => sendMessage(msg),
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
    // The "Not yet synced" placeholder key must NOT render when we have a
    // real timestamp; only the formatted Date string should.
    await waitFor(() =>
      expect(screen.queryByText("settings.sync.status.not_yet_synced")).toBeNull(),
    );
    expect(syncMetaGet).toHaveBeenCalledWith("lastSyncAt");
  });

  it("renders the not-yet-synced placeholder only when db.syncMeta has no lastSyncAt", async () => {
    syncMetaGet.mockResolvedValueOnce(undefined);
    syncOutboxCount.mockResolvedValueOnce(0);

    const SyncStatusCard = await loadComponent();
    render(<SyncStatusCard auth={AUTH} />);

    await waitFor(() =>
      expect(screen.getByText("settings.sync.status.not_yet_synced")).toBeTruthy(),
    );
  });

  it("Sync now button dispatches SYNC_REQUEST so bg engine drains the outbox on demand", async () => {
    const SyncStatusCard = await loadComponent();
    render(<SyncStatusCard auth={AUTH} />);

    // Wait for initial refresh so the button is mounted in the post-load tree.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "settings.sync.status.sync_now" })).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: "settings.sync.status.sync_now" }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: MSG.SYNC_REQUEST }));
  });

  it("surfaces lastBootstrapSkipped count when > 0 so the user knows some tabs aren't synced", async () => {
    syncMetaGet.mockImplementation(async (key: string) => {
      if (key === "lastBootstrapSkipped") return { key, value: 12 };
      return undefined;
    });

    const SyncStatusCard = await loadComponent();
    render(<SyncStatusCard auth={AUTH} />);

    // The mocked t() echoes vars as `key(count=12)`. We assert the count
    // got threaded through interpolation, regardless of which i18n string
    // ultimately renders.
    await waitFor(() =>
      expect(screen.getByText(/settings\.sync\.status\.skipped\(count=12\)/)).toBeTruthy(),
    );
  });

  it("does NOT render the skipped-count line when the count is 0", async () => {
    syncMetaGet.mockImplementation(async (key: string) => {
      if (key === "lastBootstrapSkipped") return { key, value: 0 };
      return undefined;
    });

    const SyncStatusCard = await loadComponent();
    render(<SyncStatusCard auth={AUTH} />);

    await waitFor(() => expect(screen.getByText("settings.sync.status.disconnect")).toBeTruthy());
    expect(screen.queryByText(/skipped/)).toBeNull();
  });
});
