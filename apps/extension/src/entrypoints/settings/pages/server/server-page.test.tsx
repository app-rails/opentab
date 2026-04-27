import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

// The connected branch composes four sub-components; we stub them to simple
// testid-bearing divs so we only assert composition here. Each sub-component
// has its own dedicated tests covering rendering details.
vi.mock("./server-hero", () => ({
  ServerHero: () => <div data-testid="server-hero" />,
}));
vi.mock("./server-info-card", () => ({
  ServerInfoCard: () => <div data-testid="server-info-card" />,
}));
vi.mock("./server-stats-cards", () => ({
  ServerStatsCards: () => <div data-testid="server-stats-cards" />,
}));
vi.mock("./server-sync-log", () => ({
  ServerSyncLog: () => <div data-testid="server-sync-log" />,
}));

// dexie-react-hooks reads `db` at module init time. Stub useLiveQuery so the
// connected branch's lastSyncAt fetch resolves to null without touching IndexedDB.
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: () => null,
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
    expect(screen.queryByTestId("server-connected")).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("server-connected")).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("server-connected")).not.toBeInTheDocument();
  });

  it("shows the reauth banner above the wizard when savedConfig exists but auth is null", () => {
    // The reauth path: engine cleared auth on a 401/403 but savedConfig is
    // still on disk, so the user is back in the wizard "for a reason".
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: SAVED_CONFIG,
      auth: null,
      hostHistory: [],
    });
    renderPage();
    expect(screen.getByTestId("server-reauth-banner")).toBeInTheDocument();
    expect(screen.getByTestId("server-wizard-placeholder")).toBeInTheDocument();
  });

  it("hides the reauth banner when savedConfig is null (first-run wizard, not a reauth)", () => {
    // Without savedConfig there's no prior connection to explain — banner
    // would be confusing on a literal first-run path.
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    });
    renderPage();
    expect(screen.queryByTestId("server-reauth-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("server-wizard-placeholder")).toBeInTheDocument();
  });

  it("clicking 稍后 dismisses the reauth banner for the rest of the mount", () => {
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: SAVED_CONFIG,
      auth: null,
      hostHistory: [],
    });
    renderPage();
    fireEvent.click(screen.getByTestId("server-reauth-banner-dismiss"));
    expect(screen.queryByTestId("server-reauth-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("server-wizard-placeholder")).toBeInTheDocument();
  });

  it("renders ServerConnected with hero + info + stats + log when enabled and authenticated", () => {
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: SAVED_CONFIG,
      auth: AUTH,
      hostHistory: [],
    });
    renderPage();
    expect(screen.getByTestId("server-connected")).toBeInTheDocument();
    expect(screen.getByTestId("server-hero")).toBeInTheDocument();
    expect(screen.getByTestId("server-info-card")).toBeInTheDocument();
    expect(screen.getByTestId("server-stats-cards")).toBeInTheDocument();
    expect(screen.getByTestId("server-sync-log")).toBeInTheDocument();
    expect(screen.queryByTestId("server-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-paused")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-wizard-placeholder")).not.toBeInTheDocument();
  });
});
