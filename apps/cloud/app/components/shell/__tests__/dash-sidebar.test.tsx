import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { DashSidebar } from "~/components/shell/dash-sidebar";
import { SidebarProvider } from "~/components/ui/sidebar";
import type { DashLayoutLoaderData } from "~/routes/dash/layout";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useSubmit: () => vi.fn(),
  };
});

const mockUser = {
  id: "u1",
  name: "Liang",
  email: "zhaolion@gmail.com",
  image: null,
  role: "user",
};

const rootLoaderData = {
  user: mockUser,
  requestInfo: { userPrefs: { theme: "system" } },
};

function renderSidebar(layoutData: DashLayoutLoaderData, initialPath: string) {
  const sidebarElement = (
    <SidebarProvider>
      <DashSidebar />
    </SidebarProvider>
  );
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "/",
        loader: () => rootLoaderData,
        children: [
          {
            id: "routes/dash/layout",
            path: "dash",
            loader: () => layoutData,
            children: [
              { index: true, element: sidebarElement },
              { path: "workspace/new", element: sidebarElement },
              { path: "workspace/:workspaceSyncId", element: sidebarElement },
              {
                path: "workspace/:workspaceSyncId/collection/:collectionSyncId/edit",
                element: sidebarElement,
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  return render(<RouterProvider router={router} />);
}

const sampleLayout: DashLayoutLoaderData = {
  workspaces: [
    { syncId: "ws-1", name: "Alpha", icon: "📁", order: "a0", updatedAt: 1000 },
    { syncId: "ws-2", name: "Beta", icon: null, order: "a1", updatedAt: 2000 },
  ],
};

describe("DashSidebar", () => {
  it("renders Dashboard and Create workspace shortcuts", async () => {
    renderSidebar(sampleLayout, "/dash");
    expect(await screen.findByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/dash");
    expect(screen.getByRole("link", { name: /Create workspace/ })).toHaveAttribute(
      "href",
      "/dash/workspace/new",
    );
  });

  it("lists every workspace from the layout loader", async () => {
    renderSidebar(sampleLayout, "/dash");
    const alpha = await screen.findByRole("link", { name: /Alpha/ });
    expect(alpha).toHaveAttribute("href", "/dash/workspace/ws-1");
    const beta = screen.getByRole("link", { name: /Beta/ });
    expect(beta).toHaveAttribute("href", "/dash/workspace/ws-2");
  });

  it("highlights the Dashboard item when on /dash", async () => {
    renderSidebar(sampleLayout, "/dash");
    const dashboardLink = await screen.findByRole("link", { name: /Dashboard/ });
    expect(dashboardLink).toHaveAttribute("data-active", "true");
  });

  it("highlights the active workspace when on /dash/workspace/:syncId", async () => {
    renderSidebar(sampleLayout, "/dash/workspace/ws-2");
    const beta = await screen.findByRole("link", { name: /Beta/ });
    expect(beta).toHaveAttribute("data-active", "true");
    const alpha = screen.getByRole("link", { name: /Alpha/ });
    expect(alpha).not.toHaveAttribute("data-active", "true");
  });

  it("shows an empty hint when there are no workspaces", async () => {
    renderSidebar({ workspaces: [] }, "/dash");
    expect(await screen.findByText("No workspaces yet.")).toBeVisible();
  });
});
