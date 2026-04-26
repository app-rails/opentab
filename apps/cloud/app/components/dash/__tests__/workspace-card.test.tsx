import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceCard } from "~/components/dash/workspace-card";
import type { WorkspaceCardView } from "~/routes/dash/index";
import { renderWithRouter } from "~/test/render-with-router";

function makeWs(overrides: Partial<WorkspaceCardView> = {}): WorkspaceCardView {
  return {
    id: 1,
    syncId: "ws-sync-1",
    name: "Reading List",
    icon: "📚",
    order: "a0",
    updatedAt: Date.UTC(2026, 0, 1, 12, 0, 0),
    collectionCount: 4,
    tabCount: 23,
    previewFavIcons: ["https://a.example.com/favicon.ico", "https://b.example.com/favicon.ico"],
    ...overrides,
  };
}

describe("WorkspaceCard", () => {
  it("links to /dash/<syncId>", () => {
    const ws = makeWs({ syncId: "ws-abc-123" });
    renderWithRouter(<WorkspaceCard ws={ws} />);

    const link = screen.getByRole("link", { name: /Reading List/ });
    expect(link).toHaveAttribute("href", `/dash/${ws.syncId}`);
  });

  it("renders the workspace name", () => {
    renderWithRouter(<WorkspaceCard ws={makeWs({ name: "Side Projects" })} />);
    expect(screen.getByText("Side Projects")).toBeVisible();
  });

  it.each([
    { collectionCount: 1, tabCount: 1, expected: "1 collection · 1 tab" },
    { collectionCount: 4, tabCount: 23, expected: "4 collections · 23 tabs" },
    { collectionCount: 0, tabCount: 0, expected: "0 collections · 0 tabs" },
  ])("pluralizes counts for $collectionCount collections / $tabCount tabs", ({
    collectionCount,
    tabCount,
    expected,
  }) => {
    const { container } = renderWithRouter(
      <WorkspaceCard ws={makeWs({ collectionCount, tabCount })} />,
    );
    expect(container.textContent).toContain(expected);
  });

  it("renders the FaviconStack with preview favicons", () => {
    const previewFavIcons = [
      "https://a.example.com/favicon.ico",
      "https://b.example.com/favicon.ico",
    ];
    const { container } = renderWithRouter(
      <WorkspaceCard ws={makeWs({ previewFavIcons, tabCount: 5 })} />,
    );

    const stack = container.querySelector('[data-testid="favicon-stack"]');
    expect(stack).toBeTruthy();
    const imgs = stack?.querySelectorAll("img") ?? [];
    expect(imgs).toHaveLength(previewFavIcons.length);
    // remaining = totalTabs - urls.length = 5 - 2 = 3
    expect(stack?.textContent).toContain("+3");
  });
});
