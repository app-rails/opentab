import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashHeader } from "~/components/dash/layout/header";
import { SidebarProvider } from "~/components/ui/sidebar";
import type { BreadcrumbEntry } from "~/lib/breadcrumbs";
import { renderWithRouter } from "~/test/render-with-router";

const useBreadcrumbsMock = vi.fn<() => BreadcrumbEntry[]>();

vi.mock("~/hooks/use-breadcrumbs", () => ({
  useBreadcrumbs: () => useBreadcrumbsMock(),
}));

function renderHeader(crumbs: BreadcrumbEntry[]) {
  useBreadcrumbsMock.mockReturnValue(crumbs);
  return renderWithRouter(
    <SidebarProvider>
      <DashHeader />
    </SidebarProvider>,
  );
}

describe("DashHeader", () => {
  it("renders the SidebarTrigger button", async () => {
    renderHeader([{ label: "Dashboard", href: "/dash" }]);
    expect(await screen.findByRole("button", { name: /toggle sidebar/i })).toBeVisible();
  });

  it("renders intermediate crumbs as links and the last as the current page", () => {
    renderHeader([
      { label: "Dashboard", href: "/dash" },
      { label: "Workspaces", href: "/dash/workspace" },
      { label: "Rename" },
    ]);

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("href", "/dash");

    const workspaces = screen.getByRole("link", { name: "Workspaces" });
    expect(workspaces).toHaveAttribute("href", "/dash/workspace");

    const current = screen.getByText("Rename");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.tagName.toLowerCase()).toBe("span");
  });

  it("renders link-less intermediate crumbs as plain text spans", () => {
    renderHeader([
      { label: "Dashboard", href: "/dash" },
      { label: "Workspaces", href: "/dash/workspace" },
      { label: "Work", href: "/dash/workspace/abc" },
      { label: "Inbox" },
      { label: "Rename" },
    ]);

    expect(screen.queryByRole("link", { name: "Inbox" })).toBeNull();
    expect(screen.getByText("Inbox").tagName.toLowerCase()).toBe("span");
    expect(screen.getByText("Rename")).toHaveAttribute("aria-current", "page");
  });
});
