import { Button } from "@opentab/ui/components/button";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ServerReauthBannerProps {
  /**
   * Click handler for the primary "重新认证" button. The wizard is already
   * mounted underneath this banner (via the `enabled && !auth && savedConfig`
   * dispatcher branch), so the typical wiring is just `setDismissed(false)`
   * (no-op visually) or a scroll-into-view. Kept as a prop so the parent
   * decides the exact behavior.
   */
  onReauth: () => void;
  /**
   * Click handler for the secondary "稍后" button. Local-only dismiss — the
   * banner re-appears on the next mount of `<ServerPage>`, since auth is
   * still null and the dispatcher will route here again.
   */
  onDismiss: () => void;
}

/**
 * Reauth banner — shown above the wizard when the engine has just cleared
 * `SyncSettings.auth` because of a runtime 401/403. The wizard itself is
 * already rendered underneath (server-page dispatcher matches
 * `enabled && !auth && savedConfig`); this banner is purely informational,
 * explaining why the user is suddenly back in the wizard. See spec §1.9 +
 * Task 29 design intent.
 *
 * Caution palette (amber, not destructive red): nothing was lost — the
 * device just needs to re-prove identity. Local data is safe.
 */
export function ServerReauthBanner({ onReauth, onDismiss }: ServerReauthBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
      data-testid="server-reauth-banner"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        <div className="font-medium text-sm">{t("settings.server.reauth_title", "认证已过期")}</div>
        <p className="text-sm/6">
          {t(
            "settings.server.reauth_body",
            "数据可能未同步,请重新授权此设备以继续使用服务器同步。本地数据已保留。",
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          data-testid="server-reauth-banner-dismiss"
        >
          {t("settings.server.reauth_dismiss", "稍后")}
        </Button>
        <Button size="sm" onClick={onReauth} data-testid="server-reauth-banner-reauth">
          {t("settings.server.reauth_action", "重新认证")}
        </Button>
      </div>
    </div>
  );
}
