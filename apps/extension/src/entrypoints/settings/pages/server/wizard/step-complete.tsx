import { Button } from "@opentab/ui/components/button";
import { CheckCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setSyncSettings } from "@/lib/sync-settings";
import { DEFAULT_SYNC_HOST } from "@/lib/sync-setup/config";
import type { WizardStepperApi } from "./server-wizard";

/**
 * Step 5 — confirm and persist SyncSettings.
 *
 * Renders a success summary plus a "完成" button. Click writes the SyncSettings
 * row, which is what `<ServerSettingsPage>` (T31) watches to flip out of the
 * wizard back into <ServerConnected>. Once written, we also reset the stepper
 * so a re-entry through "Reconfigure" starts clean.
 *
 * TODO(T28): host + auth payload are placeholders. The real values must come
 * from step-connect (host) and step-authorize (exchange response →
 * deviceToken/deviceId/deviceName/user). Once the wizard threads context
 * between steps in T28, replace the constants below with the real values
 * and drop the placeholder branch.
 */
export function StepComplete({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const finalize = async () => {
    setSaving(true);
    const now = Date.now();
    // TODO(T28): replace with values from prior steps. The placeholders below
    // are non-functional (deviceToken won't auth against a real server) but
    // satisfy the SyncSettings shape so <ServerConnected> can render.
    await setSyncSettings({
      enabled: true,
      savedConfig: { host: DEFAULT_SYNC_HOST, lastUsedAt: now },
      auth: {
        deviceToken: "PLACEHOLDER_T28",
        deviceId: "00000000-0000-7000-8000-000000000000",
        deviceName: "Placeholder Device",
        issuedAt: now,
      },
      hostHistory: [{ host: DEFAULT_SYNC_HOST, lastUsedAt: now }],
    });
    stepper.navigation.reset();
  };

  return (
    <div data-testid="wizard-step-complete" className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <CheckCircle className="size-16 text-status-green" aria-hidden="true" />
        <h2 className="font-semibold text-xl">
          {t("settings.wizard.step_complete_title_done", "同步已启用")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t(
            "settings.wizard.step_complete_summary",
            "数据将自动在所有设备间同步。可以随时在设置中关闭或重新配置。",
          )}
        </p>
      </div>
      <div className="flex justify-center">
        <Button data-testid="wizard-complete-finish" onClick={finalize} disabled={saving}>
          {saving
            ? t("settings.wizard.step_complete_saving", "正在保存...")
            : t("settings.wizard.step_complete_finish", "完成")}
        </Button>
      </div>
    </div>
  );
}
