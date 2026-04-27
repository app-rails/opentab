import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncSettings } from "@/lib/sync-settings";

// Mock dependencies before importing the component-under-test so the module
// graph picks up the stubs. The sidebar pulls in <UserBar>, which itself uses
// useTheme + useLocale + ThemeToggler — all need lightweight fakes so the
// test stays DOM-only and doesn't touch chrome.* APIs.

const mockSetTheme = vi.fn();
const mockCycleLocale = vi.fn();
const mockSetLocale = vi.fn();
let currentLocale: "en" | "zh" = "en";

vi.mock("@/lib/theme", () => ({
  useTheme: () => ({ mode: "system", setTheme: mockSetTheme, cycleTheme: vi.fn() }),
}));

vi.mock("@/lib/locale", () => ({
  useLocale: () => ({
    locale: currentLocale,
    setLocale: mockSetLocale,
    cycleLocale: mockCycleLocale,
  }),
}));

// useSyncSettings drives the server nav dot/label and the UserBar avatar/name.
// Same pattern as server-page.test.tsx: each it() block sets the next return
// value, then renders so the snapshot is deterministic without chrome.storage.
const mockUseSyncSettings = vi.fn<() => SyncSettings>();

vi.mock("@/lib/use-sync-settings", () => ({
  useSyncSettings: () => mockUseSyncSettings(),
}));

// Map the few i18n keys this sidebar reads to the real `EN`/`中` glyphs the
// production locale files ship; everything else echoes the fallback (or the
// key) so labels stay deterministic without pulling in i18next.
const I18N_FIXTURES: Record<string, string> = {
  "sidebar.language_en": "EN",
  "sidebar.language_zh": "中",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (key in I18N_FIXTURES) return I18N_FIXTURES[key];
      return typeof fallback === "string" ? fallback : key;
    },
  }),
}));

import { MemoryRouter } from "react-router";
import { SettingsSidebar } from "./settings-sidebar";

const DISABLED_NO_CONFIG: SyncSettings = {
  enabled: false,
  savedConfig: null,
  auth: null,
  hostHistory: [],
};

const SAVED_CONFIG = { host: "https://sync.example.com", lastUsedAt: 1_700_000_000_000 };

const DISABLED_WITH_CONFIG: SyncSettings = {
  enabled: false,
  savedConfig: SAVED_CONFIG,
  auth: null,
  hostHistory: [{ host: SAVED_CONFIG.host, lastUsedAt: SAVED_CONFIG.lastUsedAt }],
};

const ENABLED_WIZARD: SyncSettings = {
  enabled: true,
  savedConfig: SAVED_CONFIG,
  auth: null,
  hostHistory: [],
};

const ENABLED_AUTH: SyncSettings = {
  enabled: true,
  savedConfig: SAVED_CONFIG,
  auth: {
    deviceToken: "token-abc",
    deviceId: "device-123",
    deviceName: "Mac mini",
    user: { id: "user-1", name: "Zhao Lion", email: "user@example.com" },
    issuedAt: 1_700_000_000_000,
  },
  hostHistory: [],
};

afterEach(() => {
  cleanup();
  mockSetTheme.mockClear();
  mockCycleLocale.mockClear();
  mockSetLocale.mockClear();
  mockUseSyncSettings.mockReset();
  currentLocale = "en";
});

beforeEach(() => {
  currentLocale = "en";
  // Default to "disabled, no config" so existing tests that don't care about
  // sync state still render the sidebar without exploding.
  mockUseSyncSettings.mockReturnValue(DISABLED_NO_CONFIG);
});

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SettingsSidebar />
    </MemoryRouter>,
  );
}

describe("<SettingsSidebar>", () => {
  it("renders 4 NavLinks with the expected hrefs", () => {
    renderAt("/");
    const links = screen.getAllByRole("link");
    // 4 nav links + 1 UserBar avatar/name link to /server
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(links[0]).toHaveAttribute("href", "/");
    expect(links[1]).toHaveAttribute("href", "/general");
    expect(links[2]).toHaveAttribute("href", "/import-export");
    expect(links[3]).toHaveAttribute("href", "/server");
  });

  it("highlights the active route via the active token class set", () => {
    renderAt("/general");
    // Active link gets the solid `bg-accent text-accent-foreground` pair;
    // inactive links get `text-muted-foreground hover:bg-accent/50 …` so we
    // match on `text-accent-foreground`, which only appears in the active
    // branch (sidesteps the `hover:bg-accent/50` substring trap).
    const generalLink = screen.getByRole("link", { name: "通用设置" });
    expect(generalLink.className).toContain("text-accent-foreground");

    const welcomeLink = screen.getByRole("link", { name: "欢迎页" });
    expect(welcomeLink.className).not.toContain("text-accent-foreground");
  });

  it("renders UserBar with theme toggler and locale toggle in the footer", () => {
    renderAt("/");
    const userBar = screen.getByTestId("user-bar");
    expect(userBar).toBeInTheDocument();

    expect(within(userBar).getByTestId("user-bar-theme")).toBeInTheDocument();
    const localeBtn = within(userBar).getByTestId("user-bar-locale");
    expect(localeBtn).toBeInTheDocument();
    // EN locale → renders the EN abbreviation.
    expect(localeBtn).toHaveTextContent("EN");
  });

  it("clicking the locale toggle calls cycleLocale", () => {
    renderAt("/");
    fireEvent.click(screen.getByTestId("user-bar-locale"));
    expect(mockCycleLocale).toHaveBeenCalledTimes(1);
  });

  describe("server nav status dot", () => {
    it("shows gray dot + 未启用 label when disabled and never configured", () => {
      mockUseSyncSettings.mockReturnValue(DISABLED_NO_CONFIG);
      renderAt("/");
      const dot = screen.getByTestId("settings-sidebar-server-dot");
      // gray = bg-muted-foreground/40 (corresponds to spec --text-tertiary)
      expect(dot.className).toContain("bg-muted-foreground");
      const label = screen.getByTestId("settings-sidebar-server-label");
      expect(label).toHaveTextContent("未启用");
    });

    it("shows gray dot + 已暂停 label when disabled but a savedConfig exists", () => {
      mockUseSyncSettings.mockReturnValue(DISABLED_WITH_CONFIG);
      renderAt("/");
      const dot = screen.getByTestId("settings-sidebar-server-dot");
      expect(dot.className).toContain("bg-muted-foreground");
      const label = screen.getByTestId("settings-sidebar-server-label");
      expect(label).toHaveTextContent("已暂停");
    });

    it("shows yellow dot + 配置中 label when enabled but not yet authenticated", () => {
      mockUseSyncSettings.mockReturnValue(ENABLED_WIZARD);
      renderAt("/");
      const dot = screen.getByTestId("settings-sidebar-server-dot");
      // yellow = bg-amber-500 (corresponds to spec --warning)
      expect(dot.className).toContain("bg-amber-500");
      const label = screen.getByTestId("settings-sidebar-server-label");
      expect(label).toHaveTextContent("配置中");
    });

    it("shows green dot + 已启用 label when enabled and authenticated", () => {
      mockUseSyncSettings.mockReturnValue(ENABLED_AUTH);
      renderAt("/");
      const dot = screen.getByTestId("settings-sidebar-server-dot");
      // green = bg-emerald-500 (corresponds to spec --success)
      expect(dot.className).toContain("bg-emerald-500");
      const label = screen.getByTestId("settings-sidebar-server-label");
      expect(label).toHaveTextContent("已启用");
    });

    it("dot carries an aria-label so screen readers get the status text", () => {
      mockUseSyncSettings.mockReturnValue(ENABLED_AUTH);
      renderAt("/");
      const dot = screen.getByTestId("settings-sidebar-server-dot");
      // aria-label comes from the tooltip copy (full status sentence) so
      // screen readers hear something more useful than the short visual label.
      expect(dot).toHaveAttribute("aria-label", expect.stringMatching(/.+/));
    });
  });

  describe("UserBar identity", () => {
    it("shows '未登录' when disabled and never configured", () => {
      mockUseSyncSettings.mockReturnValue(DISABLED_NO_CONFIG);
      renderAt("/");
      const userBar = screen.getByTestId("user-bar");
      expect(within(userBar).getByTestId("user-bar-name")).toHaveTextContent("未登录");
      // Avatar falls back to "?" when there's no identity to show.
      expect(within(userBar).getByTestId("user-bar-avatar")).toHaveTextContent("?");
    });

    it("shows '已暂停' when disabled but a savedConfig exists", () => {
      mockUseSyncSettings.mockReturnValue(DISABLED_WITH_CONFIG);
      renderAt("/");
      const userBar = screen.getByTestId("user-bar");
      expect(within(userBar).getByTestId("user-bar-name")).toHaveTextContent("已暂停");
    });

    it("shows '配置中' when enabled but auth is missing (wizard)", () => {
      mockUseSyncSettings.mockReturnValue(ENABLED_WIZARD);
      renderAt("/");
      const userBar = screen.getByTestId("user-bar");
      expect(within(userBar).getByTestId("user-bar-name")).toHaveTextContent("配置中");
    });

    it("shows the user.name first letter + name when authenticated", () => {
      mockUseSyncSettings.mockReturnValue(ENABLED_AUTH);
      renderAt("/");
      const userBar = screen.getByTestId("user-bar");
      expect(within(userBar).getByTestId("user-bar-avatar")).toHaveTextContent("Z");
      expect(within(userBar).getByTestId("user-bar-name")).toHaveTextContent("Zhao Lion");
    });

    it("avatar+name link points at /server so users can jump into setup", () => {
      mockUseSyncSettings.mockReturnValue(DISABLED_NO_CONFIG);
      renderAt("/");
      const userBar = screen.getByTestId("user-bar");
      const link = within(userBar).getByTestId("user-bar-link");
      expect(link).toHaveAttribute("href", "/server");
    });
  });
});
