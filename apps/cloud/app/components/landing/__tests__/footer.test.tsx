import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "~/components/landing/footer";
import { renderWithRouter } from "~/test/render-with-router";

describe("Footer", () => {
  it("renders copyright with the current year", () => {
    renderWithRouter(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`©\\s*${year}\\s*OpenTab`))).toBeVisible();
  });

  it("renders a Privacy link to /legal/privacy", () => {
    renderWithRouter(<Footer />);
    const link = screen.getByRole("link", { name: /Privacy/i });
    expect(link).toHaveAttribute("href", "/legal/privacy");
  });

  it("renders a Terms link to /legal/terms", () => {
    renderWithRouter(<Footer />);
    const link = screen.getByRole("link", { name: /Terms/i });
    expect(link).toHaveAttribute("href", "/legal/terms");
  });

  it("renders a Security link to /legal/security", () => {
    renderWithRouter(<Footer />);
    const link = screen.getByRole("link", { name: /Security/i });
    expect(link).toHaveAttribute("href", "/legal/security");
  });

  it("renders an external GitHub link with target=_blank rel=noreferrer", () => {
    renderWithRouter(<Footer />);
    const link = screen.getByRole("link", { name: /GitHub/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
  });
});
