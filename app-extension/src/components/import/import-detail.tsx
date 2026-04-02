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
  if (colDiff.status === "same") {
    return (
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {wsDiff.name} / {colDiff.name}
        </h3>
        <p className="text-sm text-muted-foreground">
          This collection is identical — nothing to import.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {wsDiff.name} / {colDiff.name}
        </h3>

        {colDiff.status === "conflict" && (
          <select
            className="rounded border border-border bg-background px-3 py-1 text-sm"
            value={colPlan.strategy}
            onChange={(e) => onStrategyChange(wsIndex, colIndex, e.target.value as MergeStrategy)}
          >
            <option value="merge">Merge</option>
            <option value="new">Create New</option>
            <option value="skip">Skip</option>
          </select>
        )}
      </div>

      <div className="flex gap-3 text-sm">
        {colDiff.toAdd.length > 0 && (
          <span className="text-green-700 dark:text-green-400">+{colDiff.toAdd.length} new</span>
        )}
        {colDiff.extraExisting.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            &minus;{colDiff.extraExisting.length} extra existing
          </span>
        )}
        {colDiff.unchangedCount > 0 && (
          <span className="text-muted-foreground">{colDiff.unchangedCount} unchanged</span>
        )}
      </div>

      {colDiff.status === "new" && (
        <>
          <h4 className="text-sm font-medium">Tabs to import ({colDiff.allTabs.length})</h4>
          <NewTabList tabs={colDiff.allTabs} />
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "merge" && (
        <>
          {colDiff.toAdd.length > 0 && (
            <>
              <h4 className="text-sm font-medium">New tabs (will be added)</h4>
              <NewTabList tabs={colDiff.toAdd} />
            </>
          )}

          {colPlan.extraExisting.length > 0 && (
            <>
              <h4 className="text-sm font-medium">
                Extra existing tabs (in your data but not in import)
              </h4>
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
          <p className="text-sm text-muted-foreground">
            A new collection &ldquo;{colDiff.name}&rdquo; will be created with all imported tabs.
          </p>
          <NewTabList tabs={colDiff.allTabs} />
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "skip" && (
        <p className="text-sm text-muted-foreground">This collection will be skipped.</p>
      )}
    </div>
  );
}
