import { Button } from "@opentab/ui/components/button";
import { useTranslation } from "react-i18next";
import type { WizardStepperApi } from "./server-wizard";

/**
 * Final step placeholder — Task 26 wires the success summary + writes
 * `setSyncSettings({ auth, savedConfig })` so the page falls through to
 * <ServerConnected>. For T25 we render only Prev so the scaffolded wizard can
 * be navigated end-to-end (no Next from the terminal step).
 */
export function StepComplete({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  return (
    <div data-testid="wizard-step-complete" className="space-y-4">
      <h2 className="font-semibold text-xl">{t("settings.wizard.step_complete_title", "完成")}</h2>
      <p className="text-muted-foreground text-sm">WIP</p>
      <div className="flex justify-start">
        <Button
          variant="outline"
          data-testid="wizard-prev"
          onClick={() => stepper.navigation.prev()}
        >
          {t("settings.wizard.prev", "上一步")}
        </Button>
      </div>
    </div>
  );
}
