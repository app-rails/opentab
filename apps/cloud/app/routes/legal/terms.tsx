import { getPageTitle } from "~/lib/utils";
import type { Route } from "./+types/terms";

export function meta() {
  return [{ title: getPageTitle("Terms of Service") }];
}

// TODO: legal copy — replace placeholder below with the finalized terms.
export default function TermsRoute(_: Route.ComponentProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-bold text-3xl md:text-4xl">Terms of Service</h1>
      <p className="mt-6 text-muted-foreground">
        Our full terms of service are being prepared. By using OpenTab Cloud you agree to use it
        responsibly and in accordance with applicable law. Detailed terms will appear here before
        public launch.
      </p>
    </article>
  );
}
