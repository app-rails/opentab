import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Features } from "~/components/landing/features";

describe("Features", () => {
  it("renders 3 feature titles", () => {
    render(<Features />);
    expect(screen.getByRole("heading", { level: 3, name: "Workspaces" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Cross-device sync" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Collections" })).toBeVisible();
  });

  it("each feature has an icon and a paragraph body", () => {
    const { container } = render(<Features />);
    const headings = container.querySelectorAll("h3");
    expect(headings.length).toBe(3);

    for (const heading of Array.from(headings)) {
      const card = heading.closest("[data-testid='feature-card']");
      expect(card).not.toBeNull();
      expect(card?.querySelector("svg")).not.toBeNull();
      expect(card?.querySelector("p")).not.toBeNull();
      expect(card?.querySelector("p")?.textContent?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("section is anchored at #features so the header nav can jump to it", () => {
    const { container } = render(<Features />);
    const section = container.querySelector("section#features");
    expect(section).not.toBeNull();
  });
});
