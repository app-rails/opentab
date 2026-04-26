import { Outlet } from "react-router";
import { LandingShell } from "~/components/landing/landing-shell";
import type { Route } from "./+types/layout";

/**
 * Legal pages share the public marketing chrome (LandingHeader + Footer)
 * since they're linked from the Footer and accessible without login. The
 * inner `<article>` wrapper centralizes content width/padding so each page
 * only renders its sections.
 */
export default function LegalLayout(_: Route.ComponentProps) {
  return (
    <LandingShell>
      <article className="mx-auto max-w-3xl px-6 py-16 lg:py-20">
        <Outlet />
      </article>
    </LandingShell>
  );
}
