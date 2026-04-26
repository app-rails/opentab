import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "~/components/dash/empty-state";
import { renderWithRouter } from "~/test/render-with-router";

describe("EmptyState", () => {
  it("renders the 'Connect your first device' CTA heading", () => {
    renderWithRouter(<EmptyState />);
    expect(screen.getByRole("heading", { name: /Connect your first device/i })).toBeVisible();
  });

  it("renders the primary 'Get Chrome extension' button with a non-empty href", () => {
    renderWithRouter(<EmptyState />);
    const primary = screen.getByRole("link", { name: /Get Chrome extension/i });
    const href = primary.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).not.toBe("");
  });

  it("renders the secondary 'I already have it' link pointing to /settings/account", () => {
    renderWithRouter(<EmptyState />);
    const secondary = screen.getByRole("link", { name: /I already have it/i });
    expect(secondary).toHaveAttribute("href", "/settings/account");
  });
});
