import { Button } from "@opentab/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@opentab/ui/components/dialog";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { TabFavicon } from "@/components/tab-favicon";
import type { DedupResult } from "@/lib/collection-dedup";

interface DedupConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: DedupResult | null;
  onConfirm: () => void;
}

export function DedupConfirmDialog({
  open,
  onOpenChange,
  result,
  onConfirm,
}: DedupConfirmDialogProps) {
  const { t } = useTranslation();

  // Keep the last non-null result so the dialog can play its close animation
  // after the parent clears `result`. Without this, `return null` would unmount
  // Radix's Dialog immediately and skip the animation.
  const lastResultRef = useRef<DedupResult | null>(null);
  if (result && result.removedCount > 0) {
    lastResultRef.current = result;
  }
  const displayResult = result ?? lastResultRef.current;

  if (!displayResult) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dedupe_dialog.title")}</DialogTitle>
          <DialogDescription>{t("dedupe_dialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-600 text-sm dark:text-amber-400">
          {t("dedupe_dialog.summary", {
            count: displayResult.removedCount,
            urlCount: displayResult.affectedUrls.length,
          })}
        </div>
        <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-1">
          {displayResult.affectedUrls.map((group) => (
            <div key={group.url} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs">
              <TabFavicon url={group.favIconUrl} size="sm" />
              <span className="flex-1 truncate font-mono text-muted-foreground">{group.url}</span>
              <span className="shrink-0 font-semibold text-amber-600 dark:text-amber-400">
                {t("dedupe_dialog.per_url_count", { count: group.originalCount })}
              </span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("dedupe_dialog.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t("dedupe_dialog.confirm", { count: displayResult.removedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
