import { redirect } from "react-router";
import { CTA } from "~/components/landing/cta";
import { Features } from "~/components/landing/features";
import { Hero } from "~/components/landing/hero";
import { LandingShell } from "~/components/landing/landing-shell";
import { appDescription, appName } from "~/lib/config";
import { auth } from "~/services/auth/auth.server";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: appName, description: appDescription }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (session) {
    throw redirect("/dash");
  }

  return null;
}

export default function IndexRoute() {
  return (
    <LandingShell>
      <Hero />
      <Features />
      <CTA />
    </LandingShell>
  );
}
