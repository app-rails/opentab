import { Button } from "@opentab/ui/components/button";
import { useTranslation } from "react-i18next";
import type { ImportPlan } from "@/lib/import/types";

function computeSummary(plan: ImportPlan) {
  let workspaces = 0;
  let collections = 0;
  let tabs = 0;

  for (const ws of plan.workspaces) {
    if (!ws.selected) continue;
    let hasSelectedCol = false;

    for (const col of ws.collections) {
      if (!col.selected || col.strategy === "skip") continue;
      hasSelectedCol = true;
      collections++;

      if (col.strategy === "new" || col.existingCollectionId == null) {
        tabs += col.allTabs.length;
      } else {
        tabs += col.toAdd.length;
      }
    }

    if (hasSelectedCol && ws.existingWorkspaceId == null) {
      workspaces++;
    }
  }

  return { workspaces, collections, tabs };
}

interface ImportSummaryBarProps {
  plan: ImportPlan;
  isImporting: boolean;
  onImport: () => void;
}

export function ImportSummaryBar({ plan, isImporting, onImport }: ImportSummaryBarProps) {
  const { t } = useTranslation();
  const { workspaces, collections, tabs } = computeSummary(plan);
  const hasWork = collections > 0 || tabs > 0;

  return (
    <div className="flex items-center justify-between border-border border-t px-6 py-3">
      <p className="text-muted-foreground text-sm">
        {t("import_summary.summary", { workspaces, collections, tabs })}
      </p>
      <Button onClick={onImport} disabled={!hasWork || isImporting}>
        {isImporting ? t("import_summary.importing") : t("import_summary.import")}
      </Button>
    </div>
  );
}
