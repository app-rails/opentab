import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hero } from "~/components/landing/hero";
import { renderWithRouter } from "~/test/render-with-router";

vi.mock("~/components/theme", () => ({
  useThemeMode: vi.fn(),
}));

import { useThemeMode } from "~/components/theme";

const mockUseThemeMode = vi.mocked(useThemeMode);

describe("Hero", () => {
  beforeEach(() => {
    mockUseThemeMode.mockReturnValue("system");
  });

  it("renders dark screenshot when user theme is dark", () => {
    mockUseThemeMode.mockReturnValue("dark");
    renderWithRouter(<Hero />);
    const img = screen.getByAltText(/dashboard/i);
    expect(img.getAttribute("src")).toContain("dashboard-dark.png");
  });

  it("renders light screenshot when user theme is light", () => {
    mockUseThemeMode.mockReturnValue("light");
    renderWithRouter(<Hero />);
    const img = screen.getByAltText(/dashboard/i);
    expect(img.getAttribute("src")).toContain("dashboard-light.png");
  });

  it("renders <picture> with prefers-color-scheme source when theme is system", () => {
    mockUseThemeMode.mockReturnValue("system");
    const { container } = renderWithRouter(<Hero />);
    const picture = container.querySelector("picture");
    expect(picture).not.toBeNull();
    const source = picture?.querySelector("source");
    expect(source).not.toBeNull();
    expect(source?.getAttribute("media")).toBe("(prefers-color-scheme: dark)");
    expect(source?.getAttribute("srcset")).toContain("dashboard-dark.png");
    const img = picture?.querySelector("img");
    expect(img?.getAttribute("src")).toContain("dashboard-light.png");
  });

  it("headline contains the placeholder copy 'without the chaos'", () => {
    renderWithRouter(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/without the chaos/i);
  });

  it("'Get extension' CTA has a non-empty href", () => {
    renderWithRouter(<Hero />);
    const cta = screen.getByRole("link", { name: /get extension/i });
    const href = cta.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href?.length).toBeGreaterThan(0);
  });
});
