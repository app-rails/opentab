import type { StatsResponse } from "@opentab/protocol";
import { Badge } from "@opentab/ui/components/badge";
import { Button } from "@opentab/ui/components/button";
import { Card } from "@opentab/ui/components/card";
import { cn } from "@opentab/ui/lib/utils";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownToLine, ArrowUpToLine, CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/db";
import { fetchServerStats } from "@/lib/server-stats-fetch";
// TODO(T31): wizard-transfer doesn't exist yet — the real upload/download
// helpers live inline as XState actors in
// `components/settings/sync-setup-wizard.tsx` (`uploadBootstrap` /
// `downloadSnapshot` inside the actors map). T31 will extract them into
// `lib/sync-setup/wizard-transfer.ts` and thread the SyncEngine via context.
// For T28 we import a shim module that the test mocks; the production module
// will be created in T31. Until then the import resolves at runtime via the
// stub file written alongside this one.
import { downloadSnapshot, uploadBootstrap } from "@/lib/sync-setup/wizard-transfer";
import { useSyncSettings } from "@/lib/use-sync-settings";
import { ReconfigureCancelLink, type WizardStepperApi } from "./server-wizard";

/**
 * Step 4 — pick a transfer direction and run the initial sync.
 *
 * Layout:
 *
 *   ┌─────────────────────────────┐  ┌─────────────────────────────┐
 *   │ ⬆ 上传本地 (推荐)           │  │ ⬇ 下载服务器                │
 *   │ workspaces / collections /  │  │ workspaces / collections /  │
 *   │ tabs (local, useLiveQuery)  │  │ tabs (server, fetched once) │
 *   │ "本地 → 服务器(覆盖)"      │  │ "服务器 → 本地(覆盖)"      │
 *   └─────────────────────────────┘  └─────────────────────────────┘
 *               ⚠ 警告:此操作不可逆。Step 1 已经备份了本地数据。
 *               [开始同步]
 *
 * Local FSM (kept inline; the wizard's XState machine isn't threaded through
 * stepperize context yet, see TODO(T31)):
 *
 *   pick   ──click card──▶ pick(direction)
 *   pick   ──click 开始同步──▶ transferring ──┬─ ok    ─▶ stepper.next()
 *                                              └─ error ─▶ error(message)
 *   error  ──click 重试──▶ transferring …
 *
 * TODO(T31): host + deviceToken come from useSyncSettings here, but auth is
 * actually still null at this point in the wizard (step-complete writes the
 * placeholder auth row in T26). Once T31 threads the exchange response from
 * step-authorize through stepperize context (or a dedicated context provider
 * around <ServerWizard>), replace the useSyncSettings reads below with the
 * real session-scoped values.
 */
type TransferDirection = "upload" | "download";
type TransferState =
  | { kind: "pick"; direction: TransferDirection | null }
  | { kind: "transferring"; direction: TransferDirection }
  | { kind: "error"; direction: TransferDirection; message: string };

type ServerStatsState =
  | { kind: "loading" }
  | { kind: "ok"; stats: StatsResponse }
  | { kind: "error" };

export function StepTransfer({ stepper }: { stepper: WizardStepperApi }) {
  const { t } = useTranslation();
  const settings = useSyncSettings();
  const host = settings.savedConfig?.host ?? "";
  // TODO(T31): step-authorize hasn't written real auth yet; this falls back to
  // the placeholder string so the fetch still issues a request the test can
  // assert against. Real device token lands in T31.
  const deviceToken = settings.auth?.deviceToken ?? "";

  // Three independent live counts. Mirrors the pattern in
  // server-stats-cards.tsx (deletedAt is null for active rows).
  const localWorkspaces = useLiveQuery(
    () => db.workspaces.filter((w) => !w.deletedAt).count(),
    [],
    0,
  );
  const localCollections = useLiveQuery(
    () => db.tabCollections.filter((c) => !c.deletedAt).count(),
    [],
    0,
  );
  const localTabs = useLiveQuery(
    () => db.collectionTabs.filter((t) => !t.deletedAt).count(),
    [],
    0,
  );

  const [serverStats, setServerStats] = useState<ServerStatsState>({ kind: "loading" });
  const [state, setState] = useState<TransferState>({ kind: "pick", direction: null });

  useEffect(() => {
    if (!host || !deviceToken) return;
    let cancelled = false;
    setServerStats({ kind: "loading" });
    fetchServerStats({ host, deviceToken }).then((result) => {
      if (cancelled) return;
      if (result.ok) setServerStats({ kind: "ok", stats: result.stats });
      else setServerStats({ kind: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [host, deviceToken]);

  const direction = state.kind === "pick" ? state.direction : state.direction;
  const isTransferring = state.kind === "transferring";

  const onPick = (next: TransferDirection) => {
    if (isTransferring) return;
    setState({ kind: "pick", direction: next });
  };

  const onConfirm = async () => {
    if (state.kind !== "pick" || !state.direction) return;
    const dir = state.direction;
    setState({ kind: "transferring", direction: dir });
    try {
      if (dir === "upload") {
        await uploadBootstrap({ host, deviceToken });
      } else {
        await downloadSnapshot({ host, deviceToken });
      }
      stepper.navigation.next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", direction: dir, message });
    }
  };

  return (
    <div data-testid="wizard-step-transfer" className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-semibold text-xl">
          {t("settings.wizard.step_transfer_title", "传输数据")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t(
            "settings.wizard.step_transfer_intro",
            "选择一个方向开始首次同步。之后会自动双向同步,无需再次选择。",
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DirectionCard
          testid="wizard-transfer-upload-card"
          icon={<ArrowUpToLine className="size-5" aria-hidden="true" />}
          title={t("settings.wizard.step_transfer_upload_title", "上传本地")}
          description={t(
            "settings.wizard.step_transfer_upload_desc",
            "本地 → 服务器(覆盖服务器现有数据)",
          )}
          recommendedLabel={t("settings.wizard.step_transfer_recommended", "推荐")}
          recommended
          selected={direction === "upload"}
          disabled={isTransferring}
          onSelect={() => onPick("upload")}
          stats={[
            {
              label: t("settings.server.stats_workspaces", "工作区"),
              value: String(localWorkspaces),
            },
            {
              label: t("settings.server.stats_collections", "集合"),
              value: String(localCollections),
            },
            {
              label: t("settings.server.stats_tabs", "标签"),
              value: String(localTabs),
            },
          ]}
        />
        <DirectionCard
          testid="wizard-transfer-download-card"
          icon={<ArrowDownToLine className="size-5" aria-hidden="true" />}
          title={t("settings.wizard.step_transfer_download_title", "下载服务器")}
          description={t(
            "settings.wizard.step_transfer_download_desc",
            "服务器 → 本地(覆盖本地现有数据)",
          )}
          selected={direction === "download"}
          disabled={isTransferring}
          onSelect={() => onPick("download")}
          stats={[
            {
              label: t("settings.server.stats_workspaces", "工作区"),
              value: serverStatsDisplay(serverStats, "workspaces"),
            },
            {
              label: t("settings.server.stats_collections", "集合"),
              value: serverStatsDisplay(serverStats, "collections"),
            },
            {
              label: t("settings.server.stats_tabs", "标签"),
              value: serverStatsDisplay(serverStats, "tabs"),
            },
          ]}
        />
      </div>

      <div
        data-testid="wizard-transfer-warning"
        className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {t(
            "settings.wizard.step_transfer_warning",
            "此操作不可逆,将覆盖另一侧的现有数据。Step 1 已经把本地数据备份到下载文件夹,出问题可恢复。",
          )}
        </span>
      </div>

      {state.kind === "error" && (
        <div
          data-testid="wizard-transfer-error"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {t("settings.wizard.step_transfer_error", "同步失败:{{message}}", {
              message: state.message,
            })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          data-testid="wizard-prev"
          onClick={() => stepper.navigation.prev()}
          disabled={isTransferring}
        >
          {t("settings.wizard.prev", "上一步")}
        </Button>
        <div className="flex items-center gap-3">
          <ReconfigureCancelLink />
          <Button
            data-testid="wizard-transfer-confirm"
            onClick={onConfirm}
            disabled={direction === null || isTransferring}
          >
            {isTransferring ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("settings.wizard.step_transfer_running", "正在同步...")}
              </>
            ) : (
              t("settings.wizard.step_transfer_start", "开始同步")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function serverStatsDisplay(state: ServerStatsState, key: keyof StatsResponse): string {
  if (state.kind === "loading") return "…";
  if (state.kind === "error") return "?";
  return String(state.stats[key]);
}

interface DirectionCardProps {
  testid: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  recommended?: boolean;
  recommendedLabel?: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  stats: Array<{ label: string; value: string }>;
}

function DirectionCard({
  testid,
  icon,
  title,
  description,
  recommended,
  recommendedLabel,
  selected,
  disabled,
  onSelect,
  stats,
}: DirectionCardProps) {
  return (
    <Card
      data-testid={testid}
      data-selected={selected}
      onClick={disabled ? undefined : onSelect}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "cursor-pointer gap-3 px-5 py-4 transition-colors",
        selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          {icon}
          <span>{title}</span>
        </div>
        {recommended && recommendedLabel && (
          <Badge variant="default" className="text-xs">
            {recommendedLabel}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="space-y-0.5">
            <div className="font-semibold text-2xl tabular-nums">{stat.value}</div>
            <div className="text-muted-foreground text-xs">{stat.label}</div>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
    </Card>
  );
}
