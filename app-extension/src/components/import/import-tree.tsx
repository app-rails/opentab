import { Checkbox } from "@/components/ui/checkbox";
import type { DiffResult, ImportPlan } from "@/lib/import/types";
import { cn } from "@/lib/utils";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    new: "bg-green-500/15 text-green-700 dark:text-green-400",
    conflict: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    same: "bg-muted text-muted-foreground",
    merge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    skip: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", styles[status] ?? "")}>
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
  return (
    <div className="space-y-1">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Workspaces
      </h2>
      {diff.workspaces.map((ws, wi) => {
        const wsPlan = plan.workspaces[wi];
        return (
          <div key={ws.name}>
            <div
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                ws.status === "same" && "opacity-50",
              )}
            >
              <Checkbox checked={wsPlan.selected} onCheckedChange={() => onToggleWorkspace(wi)} />
              <span className="flex-1 truncate text-sm font-medium">{ws.name}</span>
              {statusBadge(ws.status)}
            </div>

            <div className="ml-6 space-y-0.5">
              {ws.collections.map((col, ci) => {
                const colPlan = wsPlan.collections[ci];
                const isSelected =
                  selectedCollection?.wsIndex === wi && selectedCollection?.colIndex === ci;
                const displayStatus = col.status === "conflict" ? colPlan.strategy : col.status;

                return (
                  <div
                    key={col.name}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1",
                      isSelected && "bg-accent",
                      col.status === "same" && "opacity-50",
                    )}
                    onClick={() => onSelectCollection({ wsIndex: wi, colIndex: ci })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onSelectCollection({ wsIndex: wi, colIndex: ci });
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Checkbox
                      checked={colPlan.selected}
                      onCheckedChange={() => onToggleCollection(wi, ci)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="flex-1 truncate text-sm">{col.name}</span>
                    {statusBadge(displayStatus)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
