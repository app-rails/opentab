import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CTA } from "~/components/landing/cta";

describe("CTA", () => {
  it("renders the spec §3.6 placeholder title", () => {
    render(<CTA />);
    expect(
      screen.getByRole("heading", { level: 2, name: /Start syncing in 60 seconds/i }),
    ).toBeVisible();
  });

  it("renders a primary button with a non-empty href", () => {
    render(<CTA />);
    const link = screen.getByRole("link", { name: /Get OpenTab/i });
    expect(link).toBeVisible();
    const href = link.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href?.length ?? 0).toBeGreaterThan(0);
  });
});
