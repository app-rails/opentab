import { Outlet } from "react-router";
import { Menu } from "~/components/settings/settings-menu";
import type { BreadcrumbHandle } from "~/lib/breadcrumbs";
import type { Route } from "./+types/layout";

export const handle: BreadcrumbHandle = {
  breadcrumb: () => ({ label: "Settings", href: "/dash/settings/account" }),
};

export default function SettingsLayout(_: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-4">
      <Menu />
      <Outlet />
    </div>
  );
}
