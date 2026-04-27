import { cn } from "@opentab/ui/lib/utils";
import { defineStepper, type Stepper } from "@stepperize/react";
import type { LucideIcon } from "lucide-react";
import { ArrowRightLeft, CheckCircle, ChevronRight, Key, Save, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepAuthorize } from "./step-authorize";
import { StepBackup } from "./step-backup";
import { StepComplete } from "./step-complete";
import { StepConnect } from "./step-connect";
import { StepTransfer } from "./step-transfer";

// ---------------------------------------------------------------------------
// Step definition
// ---------------------------------------------------------------------------

type StepId = "backup" | "connect" | "authorize" | "transfer" | "complete";

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
 */
export function ServerWizard() {
  return (
    <Scoped>
      <WizardInner />
    </Scoped>
  );
}

function WizardInner() {
  const stepper = useStepper();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-8 py-10" data-testid="server-wizard">
      <WizardHeader stepper={stepper} />
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

function WizardHeader({ stepper }: { stepper: WizardStepperApi }) {
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
        return (
          <li
            key={id}
            data-testid={`wizard-header-step-${id}`}
            data-step-id={id}
            className="flex flex-1 items-center gap-2"
          >
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                isActive && "border-primary bg-primary text-primary-foreground shadow-sm",
                isPast && "border-primary bg-primary/10 text-primary",
                !isActive && !isPast && "border-muted-foreground/30 text-muted-foreground",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate font-medium text-sm",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t(lookup.titleKey, lookup.titleFallback)}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {t(lookup.descKey, lookup.descFallback)}
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
