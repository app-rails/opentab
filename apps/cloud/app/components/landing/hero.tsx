import { Link } from "react-router";
import { useThemeMode } from "~/components/theme";
import { Button } from "~/components/ui/button";
import { CHROME_STORE_URL } from "~/lib/external-links";

const LIGHT_SCREENSHOT = "/images/dashboard-light.png";
const DARK_SCREENSHOT = "/images/dashboard-dark.png";

/**
 * Landing hero. Left column carries the headline + dual CTAs, right column
 * shows a product screenshot that swaps with the user's theme preference.
 *
 * Theme handling:
 *   light  → static <img> pointing at the light asset
 *   dark   → static <img> pointing at the dark asset
 *   system → <picture> with a `prefers-color-scheme: dark` source so the
 *            OS preference still drives the swap when the user has not
 *            forced a theme. A plain media-query <picture> is wrong for
 *            the explicit light/dark cases because it ignores the user's
 *            in-app override (e.g. dark OS + forced light app).
 *
 * Background = stacked radial gradients + a faint grid mask. Inline style
 * keeps the gradient definition in one place; the grid is a Tailwind layer
 * sibling so it can be tuned independently.
 */
export function Hero() {
  const theme = useThemeMode();

  const screenshot =
    theme === "system" ? (
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={DARK_SCREENSHOT} />
        <img
          src={LIGHT_SCREENSHOT}
          alt="OpenTab dashboard preview"
          className="w-full rounded-lg border border-border shadow-2xl"
        />
      </picture>
    ) : (
      <img
        src={theme === "dark" ? DARK_SCREENSHOT : LIGHT_SCREENSHOT}
        alt="OpenTab dashboard preview"
        className="w-full rounded-lg border border-border shadow-2xl"
      />
    );

  return (
    <section
      className="relative overflow-hidden"
      style={{
        backgroundImage: `
          radial-gradient(800px 300px at 50% 0%, var(--landing-orb-indigo), transparent 60%),
          radial-gradient(600px 200px at 30% 80%, var(--landing-orb-pink), transparent 60%)
        `,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(120,120,120,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,120,120,0.08)_1px,transparent_1px)] bg-[size:40px_40px]"
        style={{
          maskImage: "radial-gradient(ellipse at 50% 30%, black 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 40%, transparent 75%)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
        <div className="flex flex-col justify-center gap-5">
          {/* TODO: copy finalize */}
          <span className="inline-flex w-fit items-center rounded-full border border-border bg-background/60 px-3 py-1 font-medium text-muted-foreground text-xs">
            v1.0 - Free
          </span>
          {/* TODO: copy finalize */}
          <h1 className="font-bold text-4xl leading-tight tracking-tight md:text-5xl">
            Tabs across every device,{" "}
            <span className="bg-gradient-to-r from-indigo-500 to-pink-500 bg-clip-text text-transparent">
              without the chaos.
            </span>
          </h1>
          {/* TODO: copy finalize */}
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            OpenTab syncs your browser workspaces and collections, local-first.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
                Get extension
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/auth/sign-in">Sign In</Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center">{screenshot}</div>
      </div>
    </section>
  );
}
