import { Button } from "~/components/ui/button";
import { CHROME_STORE_URL } from "~/lib/external-links";

/**
 * Landing CTA. Single block: title + main button. Soft brand-color gradient
 * background (low-saturation primary/accent fading into the page background)
 * to close the page with one clear action: install the extension.
 *
 * Spec §3.5 / §3.6: title placeholder is "Start syncing in 60 seconds.",
 * single primary button links to the Chrome Web Store listing.
 */
export function CTA() {
  return (
    <section className="relative overflow-hidden border-t">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--landing-cta-from) 0%, var(--landing-cta-mid) 50%, transparent 100%)",
        }}
      />
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        {/* TODO: copy finalize */}
        <h2 className="font-bold text-3xl tracking-tight md:text-4xl">
          Start syncing in 60 seconds.
        </h2>
        {/* TODO: copy finalize */}
        <p className="mt-4 text-base text-muted-foreground md:text-lg">
          A single Chrome extension. Local-first. Opt-in cloud sync.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild size="lg">
            <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
              Get OpenTab
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
