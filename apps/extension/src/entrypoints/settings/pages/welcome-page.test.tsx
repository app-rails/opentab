import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Echo i18n keys back as their fallback so labels stay deterministic without
// pulling in the real i18next instance. Mirrors the pattern in
// settings-sidebar.test.tsx so behavior is consistent across the suite.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

import { MemoryRouter } from "react-router";
import { WelcomePage } from "./welcome-page";

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <WelcomePage />
    </MemoryRouter>,
  );
}

describe("<WelcomePage>", () => {
  it("renders the title and subtitle", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("欢迎使用 OpenTab");
    expect(screen.getByText(/先花一分钟配置一下/)).toBeInTheDocument();
  });

  it("renders 3 CTA links to /general, /import-export, and /server", () => {
    renderPage();
    // Three CTA <a> elements, one per setup card. MemoryRouter renders plain
    // hrefs (no leading `#`); production HashRouter prepends `#/` at runtime.
    const languageLink = screen.getByRole("link", { name: /前往设置/ });
    expect(languageLink).toHaveAttribute("href", "/general");

    const importLink = screen.getByRole("link", { name: /前往导入/ });
    expect(importLink).toHaveAttribute("href", "/import-export");

    const syncLink = screen.getByRole("link", { name: /前往配置/ });
    expect(syncLink).toHaveAttribute("href", "/server");

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("renders the three card titles and descriptions", () => {
    renderPage();
    expect(screen.getByText("设置语言")).toBeInTheDocument();
    expect(screen.getByText("导入已有数据")).toBeInTheDocument();
    expect(screen.getByText("配置服务器同步")).toBeInTheDocument();
    expect(screen.getByText(/中文 \/ English/)).toBeInTheDocument();
    expect(screen.getByText(/OneTab \/ Toby/)).toBeInTheDocument();
    expect(screen.getByText(/OpenTab Cloud/)).toBeInTheDocument();
  });

  it("renders the bottom hint pointing back to the main UI", () => {
    renderPage();
    expect(screen.getByText(/不知道从哪开始/)).toBeInTheDocument();
  });
});
