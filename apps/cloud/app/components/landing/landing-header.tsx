import { Link } from "react-router";
import { AppLogo } from "~/components/app-logo";
import { Button } from "~/components/ui/button";

// TODO: replace with published listing URL
const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/opentab/PLACEHOLDER";

/**
 * Public landing page header. Logo on the left, brief nav in the middle
 * (Features anchor + Extension link to the Chrome Web Store), Sign In and
 * Sign Up buttons on the right. Sticky to the viewport top so the CTAs
 * stay reachable as the user scrolls the marketing sections.
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <AppLogo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a href="#features" className="text-muted-foreground hover:text-foreground">
            Features
          </a>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            Extension
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/auth/sign-in">Sign In</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth/sign-up">Sign Up</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
