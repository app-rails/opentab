import { Outlet } from "react-router";
import { LandingShell } from "~/components/landing/landing-shell";
import type { Route } from "./+types/layout";

/**
 * Legal pages share the public marketing chrome (LandingHeader + Footer)
 * since they're linked from the Footer and accessible without login.
 */
export default function LegalLayout(_: Route.ComponentProps) {
  return (
    <LandingShell>
      <Outlet />
    </LandingShell>
  );
}
