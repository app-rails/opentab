import { getPageTitle } from "~/lib/utils";
import type { Route } from "./+types/privacy";

export function meta() {
  return [{ title: getPageTitle("Privacy Policy") }];
}

// TODO: legal copy — replace placeholder below with the finalized policy.
export default function PrivacyRoute(_: Route.ComponentProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-bold text-3xl md:text-4xl">Privacy Policy</h1>
      <p className="mt-6 text-muted-foreground">
        Our full privacy policy is being prepared. OpenTab is local-first; cloud sync is opt-in, and
        we only retain the data you choose to upload. Detailed terms will appear here before public
        launch.
      </p>
    </article>
  );
}
