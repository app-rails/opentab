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
  it("renders 4 fixed items for non-admin users in order", async () => {
    renderNav({ role: "user" });

    expect(await screen.findByRole("link", { name: /Dashboard/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Workspaces/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Devices/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Settings/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Admin/ })).toBeNull();
  });

  it("renders 5 items including Admin for admin users", async () => {
    renderNav({ role: "admin" });

    expect(await screen.findByRole("link", { name: /Dashboard/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Workspaces/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Devices/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Settings/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Admin/ })).toBeVisible();
  });

  it("Workspaces link points at /dash/workspace", async () => {
    renderNav({ role: "user" });
    const ws = await screen.findByRole("link", { name: /Workspaces/ });
    expect(ws).toHaveAttribute("href", "/dash/workspace");
  });

  it("Dashboard is exact-active only on /dash, not on /dash/workspace", async () => {
    renderNav({ role: "user", initialEntries: ["/dash"] });

    const dashboardLink = await screen.findByRole("link", { name: /Dashboard/ });
    expect(dashboardLink).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: /Workspaces/ })).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(screen.getByRole("link", { name: /Devices/ })).toHaveAttribute("data-active", "false");
  });

  it("Workspaces stays active on prefix matches under /dash/workspace", async () => {
    renderNav({
      role: "user",
      initialEntries: ["/dash/workspace/abc/collection/def/edit"],
    });

    expect(await screen.findByRole("link", { name: /Workspaces/ })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("data-active", "false");
  });

  it("Devices is active on /dash/devices subroutes; Workspaces stays inactive there", async () => {
    renderNav({ role: "user", initialEntries: ["/dash/devices/foo"] });

    expect(await screen.findByRole("link", { name: /Devices/ })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: /Workspaces/ })).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("Settings stays active across all /dash/settings sibling pages", async () => {
    renderNav({ role: "user", initialEntries: ["/dash/settings/appearance"] });

    expect(await screen.findByRole("link", { name: /Settings/ })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("data-active", "false");
  });

  it("Settings is also active on the canonical landing /dash/settings/account", async () => {
    renderNav({ role: "user", initialEntries: ["/dash/settings/account"] });

    expect(await screen.findByRole("link", { name: /Settings/ })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("Settings stays inactive on unrelated /dash routes", async () => {
    renderNav({ role: "user", initialEntries: ["/dash/workspace/abc"] });

    expect(await screen.findByRole("link", { name: /Settings/ })).toHaveAttribute(
      "data-active",
      "false",
    );
  });
});
