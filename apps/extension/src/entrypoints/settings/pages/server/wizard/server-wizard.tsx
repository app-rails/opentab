import { cn } from "@opentab/ui/lib/utils";
import { defineStepper, type Stepper } from "@stepperize/react";
import type { LucideIcon } from "lucide-react";
import { ArrowRightLeft, CheckCircle, ChevronRight, Key, Save, Server } from "lucide-react";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { StepAuthorize } from "./step-authorize";
import { StepBackup } from "./step-backup";
import { StepComplete } from "./step-complete";
import { StepConnect } from "./step-connect";
import { StepTransfer } from "./step-transfer";

// ---------------------------------------------------------------------------
// Step definition
// ---------------------------------------------------------------------------

export type WizardStepId = "backup" | "connect" | "authorize" | "transfer" | "complete";
type StepId = WizardStepId;

// Tuple shape for stepperize. Declared explicitly so the type that escapes via
// `WizardStepperApi` doesn't depend on a pnpm-internal `.pnpm/...` path,
// which `tsc --declaration --isolatedDeclarations` flags as non-portable.
type WizardSteps = [
  { id: "backup"; icon: LucideIcon },
  { id: "connect"; icon: LucideIcon },
  { id: "authorize"; icon: LucideIcon },
  { id: "transfer"; icon: LucideIcon },
  { id: "complete"; icon: LucideIcon },
];

/**
 * Public type for step components — they receive the stepper instance as a
 * prop and call `stepper.navigation.next()` / `prev()` from their button
 * handlers. Annotated explicitly to avoid leaking the .pnpm path.
 */
export type WizardStepperApi = Stepper<WizardSteps>;

// Steps carry an icon alongside id; titles are translated in the header so the
// step shape stays static (defineStepper expects a const literal). Icon refs
// are wired through to the avatar grid; the translated label lives in the
// header lookup table below.
const { Scoped, useStepper } = defineStepper(
  { id: "backup", icon: Save },
  { id: "connect", icon: Server },
  { id: "authorize", icon: Key },
  { id: "transfer", icon: ArrowRightLeft },
  { id: "complete", icon: CheckCircle },
);

// ---------------------------------------------------------------------------
// Wizard container
// ---------------------------------------------------------------------------

/**
 * Stepperize wizard shell. Routes a 5-step setup flow:
 *
 *   backup → connect → authorize → transfer → complete
 *
 * Visual: top header bar with avatar + title per step, chevron between, body
 * switches by `stepper.flow.switch(...)`. Each step file owns its own JSX +
 * Next/Prev buttons (T25 placeholders, T26-T28 fill in real logic).
 *
 * XState: this scaffold deliberately skips wiring `createSetupMachine`. T26
 * (step-backup) is the first step that actually fires a real actor, so the
 * machine instance + actor map will be threaded through React context at
 * that point. Until then the steps are pure UI shells.
 *
 * Reconfigure mode (T31): when re-entered from the connected view via the
 * "重新配置" menu, the parent passes `startStep="connect"` + `reconfigureMode`
 * + `onCancelReconfigure`. The wizard then:
 *   1. Initialises stepperize at `startStep` (skipping local backup since
 *      it's redundant when an authenticated session already exists).
 *   2. Shows Step 1 (backup) in the header as "已跳过" (line-through, gray)
 *      so the user still sees the full 5-step rhythm but can't navigate
 *      backwards into it.
 *   3. Threads `onCancelReconfigure` to step components via React Context
 *      so each step's footer can render a "取消重新配置" link without
 *      prop-drilling through 5 step files.
 *
 * TODO(spec §6.1): the cancel link semantics depend on whether Step 3 OAuth
 * exchange invalidates the prior token before complete. Pending decision in
 * spec §6.1 last item; if the prior token is killed mid-flow, cancelling
 * past Step 3 cannot recover the original connected view.
 */
export interface ServerWizardProps {
  /** Step to land on when the wizard mounts; defaults to "backup". */
  startStep?: WizardStepId;
  /**
   * When true, the wizard renders in reconfigure mode: backup step shown as
   * skipped in the header, cancel link visible in every step's footer.
   */
  reconfigureMode?: boolean;
  /**
   * Cancel handler. Provided in reconfigure mode; click → parent flips its
   * own `reconfiguring` flag back to false so the connected view returns
   * without touching SyncSettings.
   */
  onCancelReconfigure?: () => void;
}

/**
 * Context for the cancel callback. Steps consume via `useReconfigureCancel()`
 * and render a footer link only when the value is non-null. Avoids drilling
 * the prop through 5 step components.
 */
const ReconfigureCancelContext = createContext<(() => void) | null>(null);

export function useReconfigureCancel(): (() => void) | null {
  return useContext(ReconfigureCancelContext);
}

/**
 * Footer link rendered in each wizard step when in reconfigure mode. Returns
 * null when no cancel handler is provided (i.e. first-run wizard), so step
 * files can drop it into their footers unconditionally.
 *
 * Visual: subtle muted-foreground text link, sits beside Next/Prev so users
 * always have an obvious escape hatch back to the connected view.
 */
export function ReconfigureCancelLink() {
  const { t } = useTranslation();
  const onCancel = useReconfigureCancel();
  if (!onCancel) return null;
  return (
    <button
      type="button"
      data-testid="wizard-reconfigure-cancel"
      onClick={onCancel}
      className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
    >
      {t("settings.wizard.reconfigure_cancel", "取消重新配置")}
    </button>
  );
}

export function ServerWizard({
  startStep,
  reconfigureMode,
  onCancelReconfigure,
}: ServerWizardProps = {}) {
  return (
    <Scoped initialStep={startStep}>
      <ReconfigureCancelContext.Provider value={onCancelReconfigure ?? null}>
        <WizardInner reconfigureMode={reconfigureMode ?? false} />
      </ReconfigureCancelContext.Provider>
    </Scoped>
  );
}

function WizardInner({ reconfigureMode }: { reconfigureMode: boolean }) {
  const stepper = useStepper();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-8 py-10" data-testid="server-wizard">
      <WizardHeader stepper={stepper} reconfigureMode={reconfigureMode} />
      <div className="rounded-lg border border-border bg-card p-6">
        {stepper.flow.switch({
          backup: () => <StepBackup stepper={stepper} />,
          connect: () => <StepConnect stepper={stepper} />,
          authorize: () => <StepAuthorize stepper={stepper} />,
          transfer: () => <StepTransfer stepper={stepper} />,
          complete: () => <StepComplete stepper={stepper} />,
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

// Maps stepper id → translation key + fallback for the header strip. Kept
// separate from defineStepper because the tuple needs to stay a const literal
// for stepperize's type system; translations are runtime-resolved.
const HEADER_LOOKUP: Record<
  StepId,
  { titleKey: string; titleFallback: string; descKey: string; descFallback: string }
> = {
  backup: {
    titleKey: "settings.wizard.step_backup_title",
    titleFallback: "备份本地数据",
    descKey: "settings.wizard.step_backup_desc",
    descFallback: "下载到本地",
  },
  connect: {
    titleKey: "settings.wizard.step_connect_title",
    titleFallback: "连接服务器",
    descKey: "settings.wizard.step_connect_desc",
    descFallback: "输入服务器地址",
  },
  authorize: {
    titleKey: "settings.wizard.step_authorize_title",
    titleFallback: "授权设备",
    descKey: "settings.wizard.step_authorize_desc",
    descFallback: "在浏览器登录",
  },
  transfer: {
    titleKey: "settings.wizard.step_transfer_title",
    titleFallback: "传输数据",
    descKey: "settings.wizard.step_transfer_desc",
    descFallback: "上传或下载",
  },
  complete: {
    titleKey: "settings.wizard.step_complete_title",
    titleFallback: "完成",
    descKey: "settings.wizard.step_complete_desc",
    descFallback: "全部就绪",
  },
};

function WizardHeader({
  stepper,
  reconfigureMode,
}: {
  stepper: WizardStepperApi;
  reconfigureMode: boolean;
}) {
  const { t } = useTranslation();
  const currentIndex = stepper.state.current.index;
  const all = stepper.state.all;

  return (
    <ol className="flex items-center gap-2">
      {all.map((step, index) => {
        const id = step.id as StepId;
        const Icon = (step as { icon: LucideIcon }).icon;
        const lookup = HEADER_LOOKUP[id];
        const isActive = index === currentIndex;
        const isPast = index < currentIndex;
        // Backup is the only step the reconfigure flow skips. When in
        // reconfigure mode, render it as "已跳过" (gray + line-through) so
        // the user still sees the full 5-step rhythm but understands it's
        // intentionally not part of this re-entry.
        const isSkipped = reconfigureMode && id === "backup";
        return (
          <li
            key={id}
            data-testid={`wizard-header-step-${id}`}
            data-step-id={id}
            data-skipped={isSkipped ? "true" : undefined}
            className="flex flex-1 items-center gap-2"
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isSkipped && "border-muted-foreground/20 text-muted-foreground/50",
                !isSkipped &&
                  isActive &&
                  "border-primary bg-primary text-primary-foreground shadow-sm",
                !isSkipped && isPast && "border-primary bg-primary/10 text-primary",
                !isSkipped &&
                  !isActive &&
                  !isPast &&
                  "border-muted-foreground/30 text-muted-foreground",
              )}
              aria-current={isActive && !isSkipped ? "step" : undefined}
            >
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate font-medium text-sm",
                  isSkipped && "text-muted-foreground/60 line-through",
                  !isSkipped && isActive && "text-foreground",
                  !isSkipped && !isActive && "text-muted-foreground",
                )}
              >
                {t(lookup.titleKey, lookup.titleFallback)}
              </div>
              <div
                className={cn(
                  "truncate text-xs",
                  isSkipped ? "text-muted-foreground/60" : "text-muted-foreground",
                )}
              >
                {isSkipped
                  ? t("settings.wizard.step_skipped", "已跳过")
                  : t(lookup.descKey, lookup.descFallback)}
              </div>
            </div>
            {index < all.length - 1 ? (
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground/50"
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
