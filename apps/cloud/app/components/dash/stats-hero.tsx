import { Card, CardContent } from "~/components/ui/card";

interface StatsHeroProps {
  workspaces: number;
  collections: number;
  tabs: number;
}

const plural = (n: number, singular: string, pluralForm: string) =>
  n === 1 ? singular : pluralForm;

interface StatProps {
  value: number;
  label: string;
}

function Stat({ value, label }: StatProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="font-semibold text-3xl tabular-nums leading-none">{value}</span>
        <span className="text-muted-foreground text-sm">{label}</span>
      </CardContent>
    </Card>
  );
}

/**
 * Top-of-dashboard summary: three stat cards laid out in a 3-column grid.
 * Pure presentational; no router, no data fetching.
 */
export function StatsHero({ workspaces, collections, tabs }: StatsHeroProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Stat value={workspaces} label={plural(workspaces, "Workspace", "Workspaces")} />
      <Stat value={collections} label={plural(collections, "Collection", "Collections")} />
      <Stat value={tabs} label={plural(tabs, "Tab", "Tabs")} />
    </div>
  );
}
