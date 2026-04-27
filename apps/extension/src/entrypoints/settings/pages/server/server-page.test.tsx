import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncSettings } from "@/lib/sync-settings";

// Echo i18n keys back as their fallback so labels stay deterministic without
// pulling in real i18next. Same pattern as welcome-page.test.tsx.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

// useSyncSettings is mocked per-test via the spy returned here. Using a direct
// hook mock is simpler than driving chrome.storage for state-dispatcher tests:
// each it() block sets the next return value, then renders ServerPage.
const mockUseSyncSettings = vi.fn<() => SyncSettings>();

vi.mock("@/lib/use-sync-settings", () => ({
  useSyncSettings: () => mockUseSyncSettings(),
}));

import { MemoryRouter } from "react-router";
import { ServerPage } from "./server-page";

afterEach(() => {
  cleanup();
  mockUseSyncSettings.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/server"]}>
      <ServerPage />
    </MemoryRouter>,
  );
}

const SAVED_CONFIG = { host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 };
const AUTH = {
  deviceToken: "token-abc",
  deviceId: "device-123",
  issuedAt: 1_700_000_000_000,
};

describe("<ServerPage>", () => {
  it("renders ServerEmpty when sync is disabled and never configured", () => {
    mockUseSyncSettings.mockReturnValue({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
    renderPage();
    expect(screen.getByTestId("server-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("server-paused")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-wizard-placeholder")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-connected-placeholder")).not.toBeInTheDocument();
  });

  it("renders ServerPaused when disabled but a savedConfig still exists", () => {
    mockUseSyncSettings.mockReturnValue({
      enabled: false,
      savedConfig: SAVED_CONFIG,
      auth: null,
      hostHistory: [{ host: SAVED_CONFIG.host, lastUsedAt: SAVED_CONFIG.lastUsedAt }],
    });
    renderPage();
    expect(screen.getByTestId("server-paused")).toBeInTheDocument();
    expect(screen.queryByTestId("server-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-wizard-placeholder")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-connected-placeholder")).not.toBeInTheDocument();
  });

  it("renders the ServerWizard placeholder when enabled but not yet authenticated", () => {
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: SAVED_CONFIG,
      auth: null,
      hostHistory: [],
    });
    renderPage();
    expect(screen.getByTestId("server-wizard-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("server-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-paused")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-connected-placeholder")).not.toBeInTheDocument();
  });

  it("renders the ServerConnected placeholder when enabled and authenticated", () => {
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: SAVED_CONFIG,
      auth: AUTH,
      hostHistory: [],
    });
    renderPage();
    expect(screen.getByTestId("server-connected-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("server-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-paused")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-wizard-placeholder")).not.toBeInTheDocument();
  });
});
