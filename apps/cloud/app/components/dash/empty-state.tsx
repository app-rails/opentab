import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { CHROME_STORE_URL } from "~/lib/external-links";

/**
 * Dashboard empty state. Shown when the user has no synced workspaces yet.
 *
 * Single CTA card per spec §3.4: a dashed-border tile centered in the page,
 * with an emoji, headline, body, primary "Get Chrome extension" button, and
 * a secondary "I already have it" link to the account settings (where the
 * sync wizard / device pairing lives). The page-level title and sub-text
 * ("Welcome to OpenTab Cloud", "No workspaces synced yet") are rendered by
 * the parent route, not this component.
 */
export function EmptyState() {
  return (
    <Card className="mx-auto max-w-sm border-dashed text-center">
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <div aria-hidden className="text-4xl">
          🚀
        </div>
        <div>
          <h3 className="font-semibold text-lg">Connect your first device</h3>
          <p className="mt-1 text-muted-foreground text-sm">
            OpenTab syncs from the browser extension. Install it and run the sync wizard to see your
            workspaces here.
          </p>
        </div>
        <Button asChild>
          <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer">
            Get Chrome extension
          </a>
        </Button>
        <Link
          to="/settings/account"
          className="text-muted-foreground text-sm hover:text-foreground"
        >
          I already have it →
        </Link>
      </CardContent>
    </Card>
  );
}
