import { Button } from "@opentab/ui/components/button";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_SYNC_HOST } from "@/lib/sync-setup/config";
import { openAuthorizationTab } from "@/lib/sync-setup/exchange";
import type { SetupCallbackPayload } from "@/lib/sync-setup/setup-callback-shared";
import { useSetupCallbackBridge } from "@/lib/sync-setup/use-callback-bridge";
import { ReconfigureCancelLink, type WizardStepperApi } from "./server-wizard";

/**
 * Step 3 — open the authorization tab and wait for the OAuth callback.
 *
 *   idle  ──click "打开授权页"──▶ waiting ──callback ok──▶ received
 *                                          └─ callback err / open err ─▶ error
 *   error ──click "重试"──▶ waiting …
 *
 * Bridge: `useSetupCallbackBridge` listens on both the runtime message + the
 * persisted storage row written by `/setup-callback.html`. We don't need to
 * dispatch into an XState machine here; the linear wizard owns the flow.
 *
 * TODO(T28): host + deviceName + platform + extensionVersion currently come
 * from constants/inline detection. Once the connect step is wired (T27) and
 * data plumbing between steps lands (T28), thread the user-typed host + the
 * resolved device identity through React context instead. The exchange
 * response also needs to flow into step-complete so it can write the real
 * `auth` payload to SyncSettings; for now the complete step writes a
 * placeholder.
 */
type AuthorizeState =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "received"; exchangeCode: string; nonce: string }
  | { kind: "error"; message: string };

function detectPlatform(): string {
  if (typeof navigator !== "undefined" && "userAgent" in navigator) {
    const ua = navigator.userAgent;
    if (ua.includes("Mac")) return "macos";
    if (ua.includes("Win")) return "windows";
    if (ua.includes("Linux")) return "linux";
    if (ua.includes("Android")) return "android";
  }
  return "web";
}

function deviceNameFromPlatform(platform: string): string {
  switch (platform) {
    case "macos":
      return "Chrome on macOS";
    case "windows":
      return "Chrome on Windows";
    case "linux":
      return "Chrome on Linux";
    case "android":
      return "Chrome on Android";
    default:
      return "Chrome";
  }
}

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function newNonce(): string {
  return crypto.randomUUID();
}

export function StepAuthorize({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  const [state, setState] = useState<AuthorizeState>({ kind: "idle" });
  const [nonce, setNonce] = useState<string>(() => newNonce());

  const handleCallback = useCallback(
    (payload: SetupCallbackPayload) => {
      // Ignore callbacks that don't match our current nonce — could be a
      // stale storage sweep from a previous wizard run.
      if (!payload.exchangeCode || !payload.nonce) {
        if (payload.error) {
          setState({ kind: "error", message: payload.error });
        }
        return;
      }
      if (payload.nonce !== nonce) return;
      setState({
        kind: "received",
        exchangeCode: payload.exchangeCode,
        nonce: payload.nonce,
      });
    },
    [nonce],
  );
  useSetupCallbackBridge(handleCallback);

  const openAuth = async () => {
    const freshNonce = newNonce();
    setNonce(freshNonce);
    setState({ kind: "waiting" });
    try {
      const platform = detectPlatform();
      // TODO(T28): replace DEFAULT_SYNC_HOST with the host from step-connect.
      await openAuthorizationTab({
        host: DEFAULT_SYNC_HOST,
        nonce: freshNonce,
        deviceName: deviceNameFromPlatform(platform),
        platform,
        extensionVersion: extensionVersion(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
    }
  };

  return (
    <div data-testid="wizard-step-authorize" className="space-y-4">
      <h2 className="font-semibold text-xl">
        {t("settings.wizard.step_authorize_title", "授权设备")}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t(
          "settings.wizard.step_authorize_intro",
          "在新打开的标签页中登录账号并授权当前设备,完成后会自动回到这里。",
        )}
      </p>

      {state.kind === "idle" && (
        <Button data-testid="wizard-authorize-open" onClick={openAuth}>
          {t("settings.wizard.step_authorize_open", "打开授权页")}
        </Button>
      )}

      {state.kind === "waiting" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>{t("settings.wizard.step_authorize_waiting", "等待授权...")}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            data-testid="wizard-authorize-reopen"
            onClick={openAuth}
          >
            {t("settings.wizard.step_authorize_reopen", "重新打开授权页")}
          </Button>
        </div>
      )}

      {state.kind === "received" && (
        <div
          data-testid="wizard-authorize-received"
          className="flex items-center gap-2 text-sm text-status-green"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <span>{t("settings.wizard.step_authorize_received", "已收到授权,可以继续")}</span>
        </div>
      )}

      {state.kind === "error" && (
        <div
          data-testid="wizard-authorize-error"
          className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3"
        >
          <div className="flex items-center gap-2 text-destructive text-sm">
            <CircleAlert className="size-4" aria-hidden="true" />
            <span>
              {t("settings.wizard.step_authorize_error", "授权失败:{{message}}", {
                message: state.message,
              })}
            </span>
          </div>
          <Button size="sm" data-testid="wizard-authorize-retry" onClick={openAuth}>
            {t("settings.wizard.step_authorize_retry", "重新授权")}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          data-testid="wizard-prev"
          onClick={() => stepper.navigation.prev()}
        >
          {t("settings.wizard.prev", "上一步")}
        </Button>
        <div className="flex items-center gap-3">
          <ReconfigureCancelLink />
          <Button
            data-testid="wizard-next"
            onClick={() => stepper.navigation.next()}
            disabled={state.kind !== "received"}
          >
            {t("settings.wizard.next", "下一步")}
          </Button>
        </div>
      </div>
    </div>
  );
}
