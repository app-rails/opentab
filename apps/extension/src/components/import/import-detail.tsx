import { useTranslation } from "react-i18next";
import type {
  CollectionDiff,
  CollectionImportPlan,
  ExtraTabDecision,
  MergeStrategy,
  WorkspaceDiff,
} from "@/lib/import/types";
import { ExtraExistingTabList, NewTabList } from "./tab-diff-list";

interface ImportDetailProps {
  wsDiff: WorkspaceDiff;
  colDiff: CollectionDiff;
  colPlan: CollectionImportPlan;
  wsIndex: number;
  colIndex: number;
  onStrategyChange: (wsIndex: number, colIndex: number, strategy: MergeStrategy) => void;
  onExtraTabDecision: (
    wsIndex: number,
    colIndex: number,
    tabId: number,
    decision: ExtraTabDecision,
  ) => void;
  onBatchExtraDecision: (wsIndex: number, colIndex: number, decision: ExtraTabDecision) => void;
}

export function ImportDetail({
  wsDiff,
  colDiff,
  colPlan,
  wsIndex,
  colIndex,
  onStrategyChange,
  onExtraTabDecision,
  onBatchExtraDecision,
}: ImportDetailProps) {
  const { t } = useTranslation();
  if (colDiff.status === "same") {
    return (
      <div>
        <h3 className="mb-2 font-medium text-muted-foreground text-sm">
          {wsDiff.name} / {colDiff.name}
        </h3>
        <p className="text-muted-foreground text-sm">{t("import_detail.identical")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-muted-foreground text-sm">
          {wsDiff.name} / {colDiff.name}
        </h3>

        {colDiff.status === "conflict" && (
          <select
            className="rounded border border-border bg-background px-3 py-1 text-sm"
            value={colPlan.strategy}
            onChange={(e) => onStrategyChange(wsIndex, colIndex, e.target.value as MergeStrategy)}
          >
            <option value="merge">{t("import_detail.merge")}</option>
            <option value="new">{t("import_detail.create_new")}</option>
            <option value="skip">{t("import_detail.skip")}</option>
          </select>
        )}
      </div>

      <div className="flex gap-3 text-sm">
        {colDiff.toAdd.length > 0 && (
          <span className="text-green-700 dark:text-green-400">
            {t("import_detail.new_count", { count: colDiff.toAdd.length })}
          </span>
        )}
        {colDiff.extraExisting.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            {t("import_detail.extra_count", { count: colDiff.extraExisting.length })}
          </span>
        )}
        {colDiff.unchangedCount > 0 && (
          <span className="text-muted-foreground">
            {t("import_detail.unchanged_count", { count: colDiff.unchangedCount })}
          </span>
        )}
      </div>

      {colDiff.status === "new" && (
        <>
          <h4 className="font-medium text-sm">
            {t("import_detail.tabs_to_import", { count: colDiff.allTabs.length })}
          </h4>
          <NewTabList tabs={colDiff.allTabs} />
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "merge" && (
        <>
          {colDiff.toAdd.length > 0 && (
            <>
              <h4 className="font-medium text-sm">{t("import_detail.new_tabs")}</h4>
              <NewTabList tabs={colDiff.toAdd} />
            </>
          )}

          {colPlan.extraExisting.length > 0 && (
            <>
              <h4 className="font-medium text-sm">{t("import_detail.extra_tabs")}</h4>
              <ExtraExistingTabList
                tabs={colPlan.extraExisting}
                onDecision={(tabId, decision) =>
                  onExtraTabDecision(wsIndex, colIndex, tabId, decision)
                }
                onBatchDecision={(decision) => onBatchExtraDecision(wsIndex, colIndex, decision)}
              />
            </>
          )}
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "new" && (
        <>
          <p className="text-muted-foreground text-sm">
            {t("import_detail.create_message", { name: colDiff.name })}
          </p>
          <NewTabList tabs={colDiff.allTabs} />
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "skip" && (
        <p className="text-muted-foreground text-sm">{t("import_detail.skip_message")}</p>
      )}
    </div>
  );
}
