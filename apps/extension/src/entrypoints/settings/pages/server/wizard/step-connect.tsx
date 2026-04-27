import { Button } from "@opentab/ui/components/button";
import { Command, CommandEmpty, CommandItem, CommandList } from "@opentab/ui/components/command";
import { Input } from "@opentab/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@opentab/ui/components/popover";
import { ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pushHost } from "@/lib/host-history";
import { setSyncSettings } from "@/lib/sync-settings";
import { checkHealth } from "@/lib/sync-setup/api-handshake";
import { DEFAULT_SYNC_HOST, normalizeHost } from "@/lib/sync-setup/config";
import { useSyncSettings } from "@/lib/use-sync-settings";
import { ReconfigureCancelLink, type WizardStepperApi } from "./server-wizard";

/**
 * Step 2 — pick the sync host and run the health handshake.
 *
 * Combobox UX (shadcn pattern: Popover + cmdk Command list):
 *   ┌──────────────────────────┐  ┌──┐
 *   │ Input (host URL)         │  │▼ │ ← popover trigger reveals hostHistory
 *   └──────────────────────────┘  └──┘
 *
 * State machine for the submit flow (mirrors step-backup's local FSM, kept
 * here instead of XState because the wizard hasn't wired its machine through
 * context yet — Task 28+ will revisit):
 *
 *   idle ──click "继续"──▶ checking ──┬─ ok ─▶ setSyncSettings + stepper.next()
 *                                     └─ !ok ─▶ error(message)
 *   error ──click "继续"──▶ checking …
 *
 * Pre-fill: savedConfig.host wins over DEFAULT_SYNC_HOST so re-entering the
 * wizard surfaces the user's last working host.
 */
type SubmitState = { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string };

function describeHealthError(
  result: Awaited<ReturnType<typeof checkHealth>>,
  t: (key: string, fallback: string, vars?: Record<string, unknown>) => string,
): string {
  if (result.kind === "ok") return "";
  if (result.kind === "server_too_old") {
    return t(
      "settings.wizard.step_connect_error_too_old",
      "服务器协议版本太旧({{version}}),请联系管理员升级。",
      { version: result.serverProtocol },
    );
  }
  return t("settings.wizard.step_connect_error_unreachable", "连接失败:{{error}}", {
    error: result.error,
  });
}

export function StepConnect({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  const settings = useSyncSettings();
  const initialHost = settings.savedConfig?.host ?? DEFAULT_SYNC_HOST;
  const [host, setHost] = useState(initialHost);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [popoverOpen, setPopoverOpen] = useState(false);

  const hostHistory = settings.hostHistory;
  const isChecking = submitState.kind === "checking";

  const onSubmit = async () => {
    const normalized = normalizeHost(host.trim());
    if (!normalized) {
      setSubmitState({
        kind: "error",
        message: t("settings.wizard.step_connect_error_empty", "请输入服务器地址。"),
      });
      return;
    }
    setSubmitState({ kind: "checking" });
    const result = await checkHealth(normalized);
    if (result.kind !== "ok") {
      setSubmitState({ kind: "error", message: describeHealthError(result, t) });
      return;
    }
    const now = Date.now();
    await setSyncSettings({
      savedConfig: { host: normalized, lastUsedAt: now },
      hostHistory: pushHost(hostHistory, normalized),
    });
    setSubmitState({ kind: "idle" });
    stepper.navigation.next();
  };

  const onPickHistory = (picked: string) => {
    setHost(picked);
    setPopoverOpen(false);
  };

  return (
    <div data-testid="wizard-step-connect" className="space-y-4">
      <h2 className="font-semibold text-xl">
        {t("settings.wizard.step_connect_title", "连接服务器")}
      </h2>
      <p className="text-muted-foreground text-sm">
        {t(
          "settings.wizard.step_connect_intro",
          "输入你的同步服务器地址。我们会先做一次握手,确认协议版本兼容。",
        )}
      </p>

      <div className="space-y-2">
        <label htmlFor="wizard-host-input" className="font-medium text-muted-foreground text-xs">
          {t("settings.wizard.step_connect_label", "服务器地址")}
        </label>
        <div className="flex gap-2">
          <Input
            id="wizard-host-input"
            data-testid="wizard-host-input"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="https://opentab.app"
            autoComplete="off"
            spellCheck={false}
            disabled={isChecking}
          />
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                data-testid="wizard-host-history-trigger"
                aria-label={t("settings.wizard.step_connect_history", "历史地址")}
                disabled={isChecking}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <Command>
                <CommandList>
                  {hostHistory.length === 0 ? (
                    <CommandEmpty>
                      {t("settings.wizard.step_connect_history_empty", "暂无历史地址")}
                    </CommandEmpty>
                  ) : (
                    hostHistory.map((entry) => (
                      <CommandItem
                        key={entry.host}
                        data-testid={`wizard-host-history-item-${entry.host}`}
                        value={entry.host}
                        onSelect={() => onPickHistory(entry.host)}
                      >
                        {entry.host}
                      </CommandItem>
                    ))
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {submitState.kind === "error" && (
        <div
          data-testid="wizard-host-error"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{submitState.message}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          data-testid="wizard-prev"
          onClick={() => stepper.navigation.prev()}
          disabled={isChecking}
        >
          {t("settings.wizard.prev", "上一步")}
        </Button>
        <div className="flex items-center gap-3">
          <ReconfigureCancelLink />
          <Button data-testid="wizard-host-submit" onClick={onSubmit} disabled={isChecking}>
            {isChecking ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("settings.wizard.step_connect_checking", "正在检查...")}
              </>
            ) : (
              t("settings.wizard.next", "下一步")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
