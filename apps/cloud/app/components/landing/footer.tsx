import { Link } from "react-router";
import { GITHUB_REPO_URL } from "~/lib/external-links";

/**
 * Public marketing footer. Closes the LandingShell with a copyright
 * line and three links (Privacy, Terms, GitHub).
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-muted-foreground text-sm sm:flex-row sm:px-6">
        <p>© {year} OpenTab</p>
        <nav className="flex items-center gap-4">
          <Link to="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/legal/security" className="hover:text-foreground">
            Security
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
