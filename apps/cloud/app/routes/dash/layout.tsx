import { Outlet } from "react-router";
import { AuthenticatedShell } from "~/components/shell/authenticated-shell";
import type { Route } from "./+types/layout";

/**
 * Thin layout for the `/dash` tree. Session enforcement is handled by the
 * global auth middleware; this wrapper exists so the dashboard index and
 * workspace-detail routes share a single mount point.
 */
export default function DashLayout(_: Route.ComponentProps) {
  return (
    <AuthenticatedShell>
      <Outlet />
    </AuthenticatedShell>
  );
}
