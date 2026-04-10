import { Checkbox } from "@opentab/ui/components/checkbox";
import { cn } from "@opentab/ui/lib/utils";
import { useTranslation } from "react-i18next";
import type { DiffResult, ImportPlan } from "@/lib/import/types";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    new: "bg-green-500/15 text-green-700 dark:text-green-400",
    conflict: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    same: "bg-muted text-muted-foreground",
    merge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    skip: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 font-medium text-xs", styles[status] ?? "")}>
      {status}
    </span>
  );
}

interface ImportTreeProps {
  diff: DiffResult;
  plan: ImportPlan;
  selectedCollection: { wsIndex: number; colIndex: number } | null;
  onToggleWorkspace: (wsIndex: number) => void;
  onToggleCollection: (wsIndex: number, colIndex: number) => void;
  onSelectCollection: (sel: { wsIndex: number; colIndex: number }) => void;
}

export function ImportTree({
  diff,
  plan,
  selectedCollection,
  onToggleWorkspace,
  onToggleCollection,
  onSelectCollection,
}: ImportTreeProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <h2 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("import_page.workspaces")}
      </h2>
      {diff.workspaces.map((ws, wi) => {
        const wsPlan = plan.workspaces[wi];
        return (
          <div key={ws.existingWorkspaceId ?? `new-${wi}`}>
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                ws.status === "same" && "opacity-50",
              )}
            >
              <Checkbox checked={wsPlan.selected} onCheckedChange={() => onToggleWorkspace(wi)} />
              <span className="flex-1 truncate font-medium text-sm">{ws.name}</span>
              {statusBadge(ws.status)}
            </div>

            <div className="ml-6 space-y-0.5">
              {ws.collections.map((col, ci) => {
                const colPlan = wsPlan.collections[ci];
                const isSelected =
                  selectedCollection?.wsIndex === wi && selectedCollection?.colIndex === ci;
                const displayStatus = col.status === "conflict" ? colPlan.strategy : col.status;

                return (
                  <button
                    type="button"
                    key={col.existingCollectionId ?? `new-${wi}-${ci}`}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left",
                      isSelected && "bg-accent",
                      col.status === "same" && "opacity-50",
                    )}
                    onClick={() => onSelectCollection({ wsIndex: wi, colIndex: ci })}
                  >
                    <Checkbox
                      checked={colPlan.selected}
                      onCheckedChange={() => onToggleCollection(wi, ci)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="flex-1 truncate text-sm">{col.name}</span>
                    {statusBadge(displayStatus)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
