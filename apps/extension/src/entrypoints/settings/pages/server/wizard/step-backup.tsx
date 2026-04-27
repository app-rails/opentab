import { Button } from "@opentab/ui/components/button";
import { useTranslation } from "react-i18next";
import type { WizardStepperApi } from "./server-wizard";

/**
 * Step 1 placeholder — Task 26 wires `exportLocalBackupToDownloads` and the
 * "backup downloaded" terminal state. For T25 we just render a Next button so
 * the scaffolded wizard can be navigated end-to-end.
 */
export function StepBackup({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  return (
    <div data-testid="wizard-step-backup" className="space-y-4">
      <h2 className="font-semibold text-xl">
        {t("settings.wizard.step_backup_title", "备份本地数据")}
      </h2>
      <p className="text-muted-foreground text-sm">WIP</p>
      <div className="flex justify-end">
        <Button data-testid="wizard-next" onClick={() => stepper.navigation.next()}>
          {t("settings.wizard.next", "下一步")}
        </Button>
      </div>
    </div>
  );
}
