import { FoldersIcon, LayersIcon } from "lucide-react";
import { Link } from "react-router";
import { FaviconStack } from "~/components/dash/favicon-stack";
import { DateTimeDisplay } from "~/components/datetime-display";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { WorkspaceCardView } from "~/routes/dash/index";

interface WorkspaceCardProps {
  ws: WorkspaceCardView;
}

/**
 * Dashboard workspace tile. Wraps the entire card in a single `<Link>` so the
 * whole surface is clickable and keyboard-focusable. Hover state is driven by
 * Tailwind `group-hover:*` so the border lights up no matter which child is
 * under the cursor.
 */
export function WorkspaceCard({ ws }: WorkspaceCardProps) {
  return (
    <Link
      to={`/dash/${ws.syncId}`}
      className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-colors group-hover:border-accent-foreground/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span aria-hidden className="text-xl">
              {ws.icon ?? "🗂️"}
            </span>
            <span className="truncate">{ws.name}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div data-testid="favicon-stack">
            <FaviconStack urls={ws.previewFavIcons} totalTabs={ws.tabCount} />
          </div>
          <div className="flex flex-wrap items-center text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FoldersIcon className="size-3.5" />
              {`${ws.collectionCount} ${ws.collectionCount === 1 ? "collection" : "collections"}`}
            </span>
            <span aria-hidden>{" · "}</span>
            <span className="inline-flex items-center gap-1">
              <LayersIcon className="size-3.5" />
              {`${ws.tabCount} ${ws.tabCount === 1 ? "tab" : "tabs"}`}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            Updated <DateTimeDisplay date={ws.updatedAt} className="text-xs" />
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
