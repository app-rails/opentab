import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import {
  type RecentlyUpdatedItem,
  RecentlyUpdatedList,
} from "~/components/dash/recently-updated-list";

function renderList(items: RecentlyUpdatedItem[]) {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: <RecentlyUpdatedList items={items} />,
      },
    ],
    { initialEntries: ["/dash"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("RecentlyUpdatedList", () => {
  const items: RecentlyUpdatedItem[] = [
    { syncId: "ws-1", name: "Alpha", icon: "📁", updatedAt: 1000 },
    { syncId: "ws-2", name: "Beta", icon: null, updatedAt: 2000 },
    { syncId: "ws-3", name: "Gamma", icon: "🚀", updatedAt: 5000 },
    { syncId: "ws-4", name: "Delta", icon: null, updatedAt: 3000 },
    { syncId: "ws-5", name: "Epsilon", icon: null, updatedAt: 4000 },
    { syncId: "ws-6", name: "Zeta", icon: null, updatedAt: 6000 },
  ];

  it("renders nothing when items is empty", () => {
    const { container } = renderList([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("caps the list at 5 rows", () => {
    renderList(items);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
  });

  it("orders rows by updatedAt descending (newest first)", () => {
    renderList(items);
    const names = screen.getAllByRole("link").map((a) => a.textContent ?? "");
    expect(names[0]).toContain("Zeta"); // updatedAt 6000
    expect(names[1]).toContain("Gamma"); // 5000
    expect(names[2]).toContain("Epsilon"); // 4000
  });

  it("links each row to /dash/workspace/:syncId", () => {
    renderList([items[2]!]); // Gamma
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dash/workspace/ws-3");
  });
});
