import { Outlet } from "react-router";
import { Menu } from "~/components/settings/settings-menu";
import { AuthenticatedShell } from "~/components/shell/authenticated-shell";
import type { Route } from "./+types/layout";

export default function Layout(_: Route.ComponentProps) {
  return (
    <AuthenticatedShell>
      <div className="flex flex-col gap-4">
        <h2 className="font-bold text-xl">Settings</h2>
        <Menu />
      </div>
      <Outlet />
    </AuthenticatedShell>
  );
}
