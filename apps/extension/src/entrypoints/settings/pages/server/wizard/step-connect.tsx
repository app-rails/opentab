import { Button } from "@opentab/ui/components/button";
import { useTranslation } from "react-i18next";
import type { WizardStepperApi } from "./server-wizard";

/**
 * Step 2 placeholder — Task 27 swaps in the host-history Combobox + the
 * `checkHealth` submission flow. For T25 we render Prev/Next so the scaffolded
 * wizard can be navigated end-to-end.
 */
export function StepConnect({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  return (
    <div data-testid="wizard-step-connect" className="space-y-4">
      <h2 className="font-semibold text-xl">
        {t("settings.wizard.step_connect_title", "连接服务器")}
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
