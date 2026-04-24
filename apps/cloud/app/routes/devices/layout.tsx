import { Outlet } from "react-router";
import type { Route } from "./+types/layout";

/**
 * Thin layout for the `/devices` tree. Session enforcement is handled by the
 * global auth middleware (`PROTECTED_ROUTES`), so the layout only needs to
 * render the outlet. Kept as a dedicated file so index + detail routes can
 * share a single crumb/title once the shell grows.
 */
export default function DevicesLayout(_: Route.ComponentProps) {
  return <Outlet />;
}
