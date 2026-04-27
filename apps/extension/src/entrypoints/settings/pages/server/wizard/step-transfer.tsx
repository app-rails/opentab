import { Button } from "@opentab/ui/components/button";
import { useTranslation } from "react-i18next";
import type { WizardStepperApi } from "./server-wizard";

/**
 * Step 4 placeholder — Task 28 wires `serverStatsFetch` + the upload/download
 * direction cards. For T25 we render Prev/Next so the scaffolded wizard can be
 * navigated end-to-end.
 */
export function StepTransfer({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  return (
    <div data-testid="wizard-step-transfer" className="space-y-4">
      <h2 className="font-semibold text-xl">
        {t("settings.wizard.step_transfer_title", "传输数据")}
      </h2>
      <p className="text-muted-foreground text-sm">WIP</p>
      <div className="flex justify-between">
        <Button
          variant="outline"
          data-testid="wizard-prev"
          onClick={() => stepper.navigation.prev()}
        >
          {t("settings.wizard.prev", "上一步")}
        </Button>
        <Button data-testid="wizard-next" onClick={() => stepper.navigation.next()}>
          {t("settings.wizard.next", "下一步")}
        </Button>
      </div>
    </div>
  );
}
