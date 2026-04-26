import { ChevronRightIcon } from "lucide-react";
import { Link } from "react-router";
import { DateTimeDisplay } from "~/components/datetime-display";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { WorkspaceIcon } from "~/components/workspace-icon";

export type RecentlyUpdatedItem = {
  syncId: string;
  name: string;
  icon: string | null;
  updatedAt: number;
};

const MAX_ROWS = 5;

/**
 * Compact list of recently-updated workspaces shown on `/dash` index. Sorted
 * descending by `updatedAt` and capped at 5 rows — sidebar already lists every
 * workspace, so this surface only needs to spotlight the most active ones.
 */
export function RecentlyUpdatedList({ items }: { items: RecentlyUpdatedItem[] }) {
  const top = [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ROWS);

  if (top.length === 0) return null;

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-base">Recently updated</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ul className="divide-y divide-border/40">
          {top.map((ws) => (
            <li key={ws.syncId}>
              <Link
                to={`/dash/workspace/${ws.syncId}`}
                className="group flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <WorkspaceIcon value={ws.icon} className="size-5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{ws.name}</span>
                <DateTimeDisplay date={ws.updatedAt} className="text-muted-foreground text-xs" />
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
