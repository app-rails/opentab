import { useTranslation } from "react-i18next";
import type { ExistingTabDecision, ExtraTabDecision, ImportTab } from "@/lib/import/types";
import { cn } from "@/lib/utils";

interface NewTabListProps {
  tabs: ImportTab[];
}

export function NewTabList({ tabs }: NewTabListProps) {
  const { t } = useTranslation();
  if (tabs.length === 0) return null;
  return (
    <div className="space-y-1">
      {tabs.map((tab, index) => (
        <div
          key={`${tab.url}::${tab.title}::${index.toString()}`}
          className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-1.5 text-sm"
        >
          <span className="font-medium text-green-700 dark:text-green-400">+</span>
          {tab.favIconUrl && <img src={tab.favIconUrl} alt="" className="size-4 shrink-0" />}
          <span className="flex-1 truncate">{tab.title}</span>
          <span className="shrink-0 truncate text-xs text-muted-foreground max-w-[200px]">
            {tab.url}
          </span>
        </div>
      ))}
    </div>
  );
}

interface ExtraExistingTabListProps {
  tabs: ExistingTabDecision[];
  onDecision: (tabId: number, decision: ExtraTabDecision) => void;
  onBatchDecision: (decision: ExtraTabDecision) => void;
}

export function ExtraExistingTabList({
  tabs,
  onDecision,
  onBatchDecision,
}: ExtraExistingTabListProps) {
  const { t } = useTranslation();
  if (tabs.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onBatchDecision("keep")}
        >
          {t("tab_diff.keep_all")}
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-destructive"
          onClick={() => onBatchDecision("delete")}
        >
          {t("tab_diff.delete_all")}
        </button>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
            tab.decision === "delete" ? "bg-red-500/10 line-through opacity-60" : "bg-amber-500/10",
          )}
        >
          <span className="font-medium text-amber-700 dark:text-amber-400">&minus;</span>
          {tab.favIconUrl && <img src={tab.favIconUrl} alt="" className="size-4 shrink-0" />}
          <span className="flex-1 truncate">{tab.title}</span>
          <select
            className="rounded border border-border bg-background px-2 py-0.5 text-xs"
            value={tab.decision}
            onChange={(e) => onDecision(tab.id, e.target.value as ExtraTabDecision)}
          >
            <option value="keep">{t("tab_diff.keep")}</option>
            <option value="delete">{t("tab_diff.delete")}</option>
          </select>
        </div>
      ))}
    </div>
  );
}
