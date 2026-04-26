import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarNav } from "~/components/shell/sidebar-nav";
import { SidebarProvider } from "~/components/ui/sidebar";
import { renderWithRouter } from "~/test/render-with-router";

const baseUser = {
  id: "u1",
  name: "Liang",
  email: "zhaolion@gmail.com",
  image: null,
};

const requestInfo = { userPrefs: { theme: "system" } };

function renderNav(opts: { role: "user" | "admin"; initialEntries?: string[] }) {
  return renderWithRouter(
    <SidebarProvider>
      <SidebarNav />
    </SidebarProvider>,
    {
      rootLoaderData: {
        user: { ...baseUser, role: opts.role },
        requestInfo,
      },
      initialEntries: opts.initialEntries ?? ["/"],
    },
  );
}

describe("SidebarNav", () => {
  it("renders 3 fixed items for non-admin users", async () => {
    renderNav({ role: "user" });

    expect(await screen.findByRole("link", { name: /Dashboard/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Devices/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Settings/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Admin/ })).toBeNull();
  });

  it("renders 4 items including Admin for admin users", async () => {
    renderNav({ role: "admin" });

    expect(await screen.findByRole("link", { name: /Dashboard/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Devices/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Settings/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Admin/ })).toBeVisible();
  });

  it("marks the active route via data-active on the matching item", async () => {
    renderNav({ role: "user", initialEntries: ["/dash"] });

    const dashboardLink = await screen.findByRole("link", { name: /Dashboard/ });
    const activeButton = dashboardLink.querySelector('[data-slot="sidebar-menu-button"]');
    expect(activeButton).toHaveAttribute("data-active", "true");

    const devicesLink = screen.getByRole("link", { name: /Devices/ });
    const inactiveButton = devicesLink.querySelector('[data-slot="sidebar-menu-button"]');
    expect(inactiveButton).toHaveAttribute("data-active", "false");
  });
});
