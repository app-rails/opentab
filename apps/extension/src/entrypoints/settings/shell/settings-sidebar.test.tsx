import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  cleanup();
  mockSetTheme.mockClear();
  mockCycleLocale.mockClear();
  mockSetLocale.mockClear();
  currentLocale = "en";
});

beforeEach(() => {
  currentLocale = "en";
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
    expect(links).toHaveLength(4);
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
});
