import type { StatsResponse } from "@opentab/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncSettings } from "@/lib/sync-settings";

// Echo i18n keys back as their fallback so labels stay deterministic without
// pulling in real i18next. Same pattern as step-connect.test.tsx.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

// useSyncSettings hands the step `host` (from savedConfig) and `deviceToken`
// (from auth). T28 reads the placeholder token written by step-complete is
// not yet here; the real auth thread is TODO(T31). For now we mock both.
const mockUseSyncSettings = vi.fn<() => SyncSettings>();
vi.mock("@/lib/use-sync-settings", () => ({
  useSyncSettings: () => mockUseSyncSettings(),
}));

// Server stats fetch — mocked so tests stay offline. The download card reads
// these numbers to show "what you'll get if you pick download".
const mockFetchServerStats = vi.fn();
vi.mock("@/lib/server-stats-fetch", () => ({
  fetchServerStats: (args: { host: string; deviceToken: string }) => mockFetchServerStats(args),
}));

// Local counts come from Dexie via useLiveQuery. We don't exercise the real
// Dexie tables here; just shim the hook so the upload card shows fixed
// numbers per test. The step calls useLiveQuery three times per render in a
// fixed order (workspaces, collections, tabs); we cycle through the return
// vector modulo 3 so re-renders keep returning the same triple.
const mockLiveQueryReturns: number[] = [0, 0, 0];
let liveQueryCallIndex = 0;
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: () => {
    const slot = liveQueryCallIndex % 3;
    liveQueryCallIndex++;
    return mockLiveQueryReturns[slot] ?? 0;
  },
}));

// db is referenced by the production module's useLiveQuery factories. The
// mock above ignores the factories, but the import still resolves, so stub
// the module to a bare object to avoid pulling Dexie into jsdom.
vi.mock("@/lib/db", () => ({
  db: {
    workspaces: { filter: () => ({ count: async () => 0 }) },
    tabCollections: { filter: () => ({ count: async () => 0 }) },
    collectionTabs: { filter: () => ({ count: async () => 0 }) },
  },
}));

// uploadBootstrap / downloadSnapshot are placeholders for T31's extracted
// transfer service. step-transfer dispatches one of them when the user
// confirms a direction; we mock both to assert the right one is invoked.
const mockUploadBootstrap = vi.fn(async () => {});
const mockDownloadSnapshot = vi.fn(async () => {});
vi.mock("@/lib/sync-setup/wizard-transfer", () => ({
  uploadBootstrap: (args: { host: string; deviceToken: string }) => mockUploadBootstrap(args),
  downloadSnapshot: (args: { host: string; deviceToken: string }) => mockDownloadSnapshot(args),
}));

import { StepTransfer } from "./step-transfer";

const stubStepper = {
  navigation: { next: vi.fn(), prev: vi.fn(), goTo: vi.fn() },
} as unknown as Parameters<typeof StepTransfer>[0]["stepper"];

function settings(overrides: Partial<SyncSettings> = {}): SyncSettings {
  return {
    enabled: false,
    savedConfig: { host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 },
    auth: {
      deviceToken: "test-device-token",
      deviceId: "00000000-0000-7000-8000-000000000000",
      issuedAt: 1_700_000_000_000,
    },
    hostHistory: [],
    ...overrides,
  };
}

function setLiveQueryReturns(values: [number, number, number]) {
  mockLiveQueryReturns[0] = values[0];
  mockLiveQueryReturns[1] = values[1];
  mockLiveQueryReturns[2] = values[2];
  liveQueryCallIndex = 0;
}

beforeEach(() => {
  mockUseSyncSettings.mockReset();
  mockUseSyncSettings.mockReturnValue(settings());
  mockFetchServerStats.mockReset();
  mockUploadBootstrap.mockReset();
  mockUploadBootstrap.mockResolvedValue(undefined);
  mockDownloadSnapshot.mockReset();
  mockDownloadSnapshot.mockResolvedValue(undefined);
  setLiveQueryReturns([0, 0, 0]);
  (stubStepper.navigation.next as ReturnType<typeof vi.fn>).mockReset();
  (stubStepper.navigation.prev as ReturnType<typeof vi.fn>).mockReset();
  (stubStepper.navigation.goTo as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(cleanup);

describe("<StepTransfer>", () => {
  it("fetches server stats on mount and shows them in the download card", async () => {
    const stats: StatsResponse = { workspaces: 8, collections: 30, tabs: 180 };
    mockFetchServerStats.mockResolvedValueOnce({ ok: true, stats });

    render(<StepTransfer stepper={stubStepper} />);

    await waitFor(() => {
      expect(mockFetchServerStats).toHaveBeenCalledWith({
        host: "https://sync.example.com",
        deviceToken: "test-device-token",
      });
    });

    const downloadCard = await screen.findByTestId("wizard-transfer-download-card");
    await waitFor(() => {
      expect(downloadCard).toHaveTextContent("8");
      expect(downloadCard).toHaveTextContent("30");
      expect(downloadCard).toHaveTextContent("180");
    });
  });

  it("shows local counts in the upload card via useLiveQuery", async () => {
    setLiveQueryReturns([3, 12, 45]);
    mockFetchServerStats.mockResolvedValueOnce({
      ok: true,
      stats: { workspaces: 0, collections: 0, tabs: 0 },
    });

    render(<StepTransfer stepper={stubStepper} />);

    const uploadCard = await screen.findByTestId("wizard-transfer-upload-card");
    expect(uploadCard).toHaveTextContent("3");
    expect(uploadCard).toHaveTextContent("12");
    expect(uploadCard).toHaveTextContent("45");
  });

  it("clicking upload then 开始同步 calls uploadBootstrap with host + deviceToken", async () => {
    setLiveQueryReturns([5, 10, 20]);
    mockFetchServerStats.mockResolvedValueOnce({
      ok: true,
      stats: { workspaces: 1, collections: 2, tabs: 3 },
    });

    render(<StepTransfer stepper={stubStepper} />);

    fireEvent.click(await screen.findByTestId("wizard-transfer-upload-card"));
    fireEvent.click(screen.getByTestId("wizard-transfer-confirm"));

    await waitFor(() => {
      expect(mockUploadBootstrap).toHaveBeenCalledWith({
        host: "https://sync.example.com",
        deviceToken: "test-device-token",
      });
    });
    expect(mockDownloadSnapshot).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(stubStepper.navigation.next).toHaveBeenCalledTimes(1);
    });
  });

  it("clicking download then 开始同步 calls downloadSnapshot with host + deviceToken", async () => {
    setLiveQueryReturns([5, 10, 20]);
    mockFetchServerStats.mockResolvedValueOnce({
      ok: true,
      stats: { workspaces: 8, collections: 30, tabs: 180 },
    });

    render(<StepTransfer stepper={stubStepper} />);

    fireEvent.click(await screen.findByTestId("wizard-transfer-download-card"));
    fireEvent.click(screen.getByTestId("wizard-transfer-confirm"));

    await waitFor(() => {
      expect(mockDownloadSnapshot).toHaveBeenCalledWith({
        host: "https://sync.example.com",
        deviceToken: "test-device-token",
      });
    });
    expect(mockUploadBootstrap).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(stubStepper.navigation.next).toHaveBeenCalledTimes(1);
    });
  });

  it("renders an irreversible-overwrite warning banner", async () => {
    mockFetchServerStats.mockResolvedValueOnce({
      ok: true,
      stats: { workspaces: 0, collections: 0, tabs: 0 },
    });

    render(<StepTransfer stepper={stubStepper} />);

    expect(await screen.findByTestId("wizard-transfer-warning")).toBeInTheDocument();
  });
});
