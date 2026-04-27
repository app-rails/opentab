import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchServerWhoamiResult } from "@/lib/server-whoami-fetch";
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

// Whoami probe runs on mount whenever (enabled && auth). Default to a 200 so
// the dispatcher quickly drops the reconnecting placeholder and we see the
// connected view; individual tests can override for unauthorized/network paths.
const mockFetchServerWhoami = vi.fn<() => Promise<FetchServerWhoamiResult>>();
vi.mock("@/lib/server-whoami-fetch", () => ({
  fetchServerWhoami: () => mockFetchServerWhoami(),
}));

// setSyncSettings is exercised by the whoami success/401 branches. Stub it so
// the dispatcher tests don't depend on chrome.storage; we only care that the
// post-whoami render lands on the right branch.
vi.mock("@/lib/sync-settings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sync-settings")>("@/lib/sync-settings");
  return {
    ...actual,
    setSyncSettings: vi.fn(async () => {}),
    getSyncSettings: vi.fn(async () => ({
      enabled: false,
      savedConfig: null,
      auth: null,
      hostHistory: [],
    })),
  };
});

import { MemoryRouter } from "react-router";
import { ServerPage } from "./server-page";

beforeEach(() => {
  // Default: whoami succeeds. Tests that care about a different branch
  // override before renderPage().
  mockFetchServerWhoami.mockResolvedValue({
    ok: true,
    whoami: {
      deviceId: "01956a8d-4f9c-7000-8000-000000000001",
      user: { id: "user-1", email: "user@example.com", name: "Tester" },
    },
  });
});

afterEach(() => {
  cleanup();
  mockUseSyncSettings.mockReset();
  mockFetchServerWhoami.mockReset();
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

  it("renders ServerConnected with hero + info + stats + log when enabled and authenticated", async () => {
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: SAVED_CONFIG,
      auth: AUTH,
      hostHistory: [],
    });
    renderPage();
    // Whoami probe runs on mount; wait for the reconnecting placeholder to
    // resolve before asserting the connected view.
    await waitFor(() => {
      expect(screen.getByTestId("server-connected")).toBeInTheDocument();
    });
    expect(screen.getByTestId("server-hero")).toBeInTheDocument();
    expect(screen.getByTestId("server-info-card")).toBeInTheDocument();
    expect(screen.getByTestId("server-stats-cards")).toBeInTheDocument();
    expect(screen.getByTestId("server-sync-log")).toBeInTheDocument();
    expect(screen.queryByTestId("server-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-paused")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-wizard-placeholder")).not.toBeInTheDocument();
    expect(mockFetchServerWhoami).toHaveBeenCalledTimes(1);
  });

  it("shows the reconnecting placeholder while whoami is in flight", async () => {
    // Hold the whoami promise open so we can observe the in-flight render
    // before resolving. Once resolved, the placeholder must give way to the
    // connected view.
    let resolveWhoami: (result: FetchServerWhoamiResult) => void = () => {};
    mockFetchServerWhoami.mockReturnValueOnce(
      new Promise<FetchServerWhoamiResult>((res) => {
        resolveWhoami = res;
      }),
    );
    mockUseSyncSettings.mockReturnValue({
      enabled: true,
      savedConfig: SAVED_CONFIG,
      auth: AUTH,
      hostHistory: [],
    });
    renderPage();
    // useEffect runs after first paint, then setReconnecting(true) triggers
    // a re-render; waitFor lets the test framework flush both.
    await waitFor(() => {
      expect(screen.getByTestId("server-reconnecting")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("server-connected")).not.toBeInTheDocument();

    resolveWhoami({
      ok: true,
      whoami: {
        deviceId: "01956a8d-4f9c-7000-8000-000000000001",
        user: { id: "user-1", email: "user@example.com", name: "Tester" },
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId("server-connected")).toBeInTheDocument();
    });
  });
});
