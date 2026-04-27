import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncSettings } from "@/lib/sync-settings";

// Echo i18n keys back as their fallback so labels stay deterministic without
// pulling in real i18next. Same pattern as server-wizard.test.tsx.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

// useSyncSettings is the hook the step reads to derive `initialHost` and
// `hostHistory`. Per-test we set the next return value, then render.
const mockUseSyncSettings = vi.fn<() => SyncSettings>();
vi.mock("@/lib/use-sync-settings", () => ({
  useSyncSettings: () => mockUseSyncSettings(),
}));

// setSyncSettings is the side effect the step performs on a successful health
// check. Captured so we can assert savedConfig + hostHistory writes.
const mockSetSyncSettings = vi.fn(async (_partial: Partial<SyncSettings>) => {});
vi.mock("@/lib/sync-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sync-settings")>("@/lib/sync-settings");
  return {
    ...actual,
    setSyncSettings: (partial: Partial<SyncSettings>) => mockSetSyncSettings(partial),
  };
});

// checkHealth is the network handshake. Mocked so tests stay offline; per-test
// we override the resolved value via mockResolvedValueOnce.
const mockCheckHealth = vi.fn();
vi.mock("@/lib/sync-setup/api-handshake", () => ({
  checkHealth: (host: string) => mockCheckHealth(host),
}));

// DEFAULT_SYNC_HOST varies between dev/prod via import.meta.env. Pin it so the
// "no savedConfig" pre-fill assertion doesn't depend on build mode.
vi.mock("@/lib/sync-setup/config", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/sync-setup/config")>("@/lib/sync-setup/config");
  return {
    ...actual,
    DEFAULT_SYNC_HOST: "https://opentab.app",
  };
});

import { StepConnect } from "./step-connect";

const stubStepper = {
  navigation: { next: vi.fn(), prev: vi.fn() },
} as unknown as Parameters<typeof StepConnect>[0]["stepper"];

beforeEach(() => {
  mockUseSyncSettings.mockReset();
  mockSetSyncSettings.mockReset();
  mockSetSyncSettings.mockResolvedValue();
  mockCheckHealth.mockReset();
  (stubStepper.navigation.next as ReturnType<typeof vi.fn>).mockReset();
  (stubStepper.navigation.prev as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(cleanup);

function settings(overrides: Partial<SyncSettings> = {}): SyncSettings {
  return {
    enabled: false,
    savedConfig: null,
    auth: null,
    hostHistory: [],
    ...overrides,
  };
}

describe("<StepConnect>", () => {
  it("renders with default host pre-filled when no savedConfig", () => {
    mockUseSyncSettings.mockReturnValue(settings());

    render(<StepConnect stepper={stubStepper} />);

    const input = screen.getByTestId("wizard-host-input") as HTMLInputElement;
    expect(input.value).toBe("https://opentab.app");
  });

  it("renders with savedConfig.host pre-filled when present", () => {
    mockUseSyncSettings.mockReturnValue(
      settings({
        savedConfig: { host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 },
      }),
    );

    render(<StepConnect stepper={stubStepper} />);

    const input = screen.getByTestId("wizard-host-input") as HTMLInputElement;
    expect(input.value).toBe("https://sync.example.com");
  });

  it("shows hostHistory items in dropdown and selecting one updates input", async () => {
    mockUseSyncSettings.mockReturnValue(
      settings({
        hostHistory: [
          { host: "https://a.example.com", lastUsedAt: 2 },
          { host: "https://b.example.com", lastUsedAt: 1 },
        ],
      }),
    );

    render(<StepConnect stepper={stubStepper} />);

    // Open the popover via the trigger button.
    fireEvent.click(screen.getByTestId("wizard-host-history-trigger"));

    const itemA = await screen.findByTestId("wizard-host-history-item-https://a.example.com");
    const itemB = await screen.findByTestId("wizard-host-history-item-https://b.example.com");
    expect(itemA).toBeInTheDocument();
    expect(itemB).toBeInTheDocument();

    // Click second item → input should adopt its host string.
    fireEvent.click(itemB);

    const input = screen.getByTestId("wizard-host-input") as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe("https://b.example.com");
    });
  });

  it("submit calls checkHealth, advances on ok, writes savedConfig + pushes history", async () => {
    mockUseSyncSettings.mockReturnValue(
      settings({
        hostHistory: [{ host: "https://old.example.com", lastUsedAt: 1 }],
      }),
    );
    mockCheckHealth.mockResolvedValueOnce({
      kind: "ok",
      response: { protocolVersion: "1.0.0" },
    });

    render(<StepConnect stepper={stubStepper} />);

    const input = screen.getByTestId("wizard-host-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://new.example.com" } });

    fireEvent.click(screen.getByTestId("wizard-host-submit"));

    await waitFor(() => {
      expect(mockCheckHealth).toHaveBeenCalledWith("https://new.example.com");
    });

    await waitFor(() => {
      expect(mockSetSyncSettings).toHaveBeenCalledTimes(1);
    });
    const partial = mockSetSyncSettings.mock.calls[0][0];
    expect(partial.savedConfig?.host).toBe("https://new.example.com");
    expect(typeof partial.savedConfig?.lastUsedAt).toBe("number");
    // pushHost prepends the new host and de-dupes; "old" stays as a 2nd entry.
    expect(partial.hostHistory?.[0].host).toBe("https://new.example.com");
    expect(partial.hostHistory?.map((e) => e.host)).toContain("https://old.example.com");

    await waitFor(() => {
      expect(stubStepper.navigation.next).toHaveBeenCalledTimes(1);
    });
  });
});
