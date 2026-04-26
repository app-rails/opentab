import { Building2Icon, FoldersIcon, LayersIcon } from "lucide-react";
import type { ComponentType } from "react";
import { Card, CardContent } from "~/components/ui/card";

interface StatsHeroProps {
  workspaces: number;
  collections: number;
  tabs: number;
}

const plural = (n: number, singular: string, pluralForm: string) =>
  n === 1 ? singular : pluralForm;

interface StatProps {
  icon: ComponentType<{ className?: string }>;
  value: number;
  label: string;
}

function Stat({ icon: Icon, value, label }: StatProps) {
  return (
    <Card className="border-border/40 bg-card/50">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-bold text-4xl tabular-nums leading-none tracking-tight">
            {value}
          </span>
          <span className="text-muted-foreground text-sm">{label}</span>
        </div>
        <Icon className="size-5 shrink-0 text-muted-foreground/60" />
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Stat
        icon={Building2Icon}
        value={workspaces}
        label={plural(workspaces, "Workspace", "Workspaces")}
      />
      <Stat
        icon={FoldersIcon}
        value={collections}
        label={plural(collections, "Collection", "Collections")}
      />
      <Stat icon={LayersIcon} value={tabs} label={plural(tabs, "Tab", "Tabs")} />
    </div>
  );
}
