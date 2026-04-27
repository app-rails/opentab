import { Button } from "@opentab/ui/components/button";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { exportLocalBackupToDownloads } from "@/lib/sync-setup/backup";
import type { WizardStepperApi } from "./server-wizard";

/**
 * Step 1 — pre-flight local backup.
 *
 * Wraps the existing `exportLocalBackupToDownloads()` library (forked from
 * `lib/export.ts` for silent saves) in a 4-state local FSM so the user always
 * sees one of: idle, running, done(filename), error(message).
 *
 *   idle ──click "立即备份"──▶ running ──┬─ ok(filename) ─▶ done
 *                                       └─ throw(err)    ─▶ error
 *   error ──click "重试"──▶ running …
 *   error ──click "跳过"──▶ next step (degraded; user owns the risk)
 *   done  ──click "下一步"──▶ next step
 *
 * No XState here on purpose — the old wizard's machine carried this state for
 * UI parity with the accordion view; the new linear wizard only needs the
 * three terminal flags + filename + error message. T28 will not wire data
 * from this step downstream beyond the filename being persisted to
 * `wizard-progress` (handled in T28 once context plumbing exists).
 */
type BackupState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; filename: string }
  | { kind: "error"; message: string };

export function StepBackup({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  const [state, setState] = useState<BackupState>({ kind: "idle" });

  const runBackup = async () => {
    setState({ kind: "running" });
    try {
      const result = await exportLocalBackupToDownloads();
      setState({ kind: "done", filename: result.filename });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
    }
  };

  return (
    <div data-testid="wizard-step-backup" className="space-y-4">
      <h2 className="font-semibold text-xl">
        {t("settings.wizard.step_backup_title", "备份本地数据")}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t(
          "settings.wizard.step_backup_intro",
          "在连接服务器前,先把本地数据导出为 JSON 备份,确保万一同步出错可以恢复。",
        )}
      </p>

      {state.kind === "idle" && (
        <Button data-testid="wizard-backup-start" onClick={runBackup}>
          {t("settings.wizard.step_backup_start", "立即备份")}
        </Button>
      )}

      {state.kind === "running" && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>{t("settings.wizard.step_backup_running", "正在导出备份...")}</span>
        </div>
      )}

      {state.kind === "done" && (
        <div
          data-testid="wizard-backup-done"
          className="flex items-center gap-2 text-sm text-status-green"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <span>
            {t("settings.wizard.step_backup_done", "已保存为 {{filename}}", {
              filename: state.filename,
            })}
          </span>
        </div>
      )}

      {state.kind === "error" && (
        <div
          data-testid="wizard-backup-error"
          className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3"
        >
          <div className="flex items-center gap-2 text-destructive text-sm">
            <CircleAlert className="size-4" aria-hidden="true" />
            <span>
              {t("settings.wizard.step_backup_error", "备份失败:{{message}}", {
                message: state.message,
              })}
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" data-testid="wizard-backup-retry" onClick={runBackup}>
              {t("settings.wizard.step_backup_retry", "重试")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="wizard-backup-skip"
              onClick={() => stepper.navigation.next()}
            >
              {t("settings.wizard.step_backup_skip", "跳过备份")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          data-testid="wizard-next"
          onClick={() => stepper.navigation.next()}
          disabled={state.kind !== "done"}
        >
          {t("settings.wizard.next", "下一步")}
        </Button>
      </div>
    </div>
  );
}
