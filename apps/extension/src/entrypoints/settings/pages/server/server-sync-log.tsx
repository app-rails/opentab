import { Badge } from "@opentab/ui/components/badge";
import { Button } from "@opentab/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@opentab/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@opentab/ui/components/table";
import { cn } from "@opentab/ui/lib/utils";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/db";
import { type Filter, type LogRow, loadSyncLog } from "@/lib/sync-log-loader";

const PAGE_SIZE = 50;

/**
 * Sync log table — 7 columns, 50 rows/page, 4-status filter (spec §3.1, §4.3).
 *
 *   useLiveQuery(loadSyncLog) → rows → table
 *               page,filter ─┘
 *
 * Pure UI: data shape and parent-name resolution live in `loadSyncLog` (T20).
 * Hard-deleted parents already fall through to `fallbackSyncIdPrefix` there;
 * here we just decide bold/muted/dash per `entityType`.
 *
 *   entityType   workspace col   collection col   tab col
 *   ──────────────────────────────────────────────────────
 *   workspace    bold            —                —
 *   collection   muted (parent)  bold             —
 *   tab          muted (parent)  muted (parent)   bold
 */
export function ServerSyncLog() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");

  // Initial value `[]` keeps the table from flashing an empty state on the
  // first undefined tick before Dexie resolves.
  const rows = useLiveQuery(() => loadSyncLog(db, page, filter), [page, filter], [] as LogRow[]);

  // Loader contract: a full page = exactly PAGE_SIZE rows. A short read means
  // we're on the last page, so disable Next without needing a total count.
  const hasNext = rows.length === PAGE_SIZE;
  const hasPrev = page > 1;

  return (
    <section className="flex flex-col gap-3" data-testid="server-sync-log">
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("settings.server.sync_log_title", "同步日志")}
        </h3>
        <Select
          value={filter}
          onValueChange={(next) => {
            setFilter(next as Filter);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" data-testid="sync-log-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("settings.server.sync_log_filter_all", "全部")}</SelectItem>
            <SelectItem value="pending">
              {t("settings.server.sync_log_filter_pending", "仅待同步")}
            </SelectItem>
            <SelectItem value="failed">
              {t("settings.server.sync_log_filter_failed", "仅重试中")}
            </SelectItem>
            <SelectItem value="dead">
              {t("settings.server.sync_log_filter_dead", "仅已放弃")}
            </SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.server.sync_log_col_workspace", "工作区")}</TableHead>
              <TableHead>{t("settings.server.sync_log_col_collection", "集合")}</TableHead>
              <TableHead>{t("settings.server.sync_log_col_tab", "标签")}</TableHead>
              <TableHead>{t("settings.server.sync_log_col_action", "动作")}</TableHead>
              <TableHead>{t("settings.server.sync_log_col_status", "状态")}</TableHead>
              <TableHead>{t("settings.server.sync_log_col_changed_at", "变更时间")}</TableHead>
              <TableHead>{t("settings.server.sync_log_col_synced_at", "同步时间")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground text-sm"
                  data-testid="sync-log-empty"
                >
                  {t("settings.server.sync_log_empty", "暂无同步活动")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => <LogTableRow key={row.id} row={row} />)
            )}
          </TableBody>
        </Table>
      </div>

      <footer className="flex items-center justify-between gap-3">
        <Legend />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label={t("settings.server.sync_log_prev", "上一页")}
            data-testid="sync-log-prev"
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums" data-testid="sync-log-page">
            {t("settings.server.sync_log_page", "第 {{page}} 页", { page })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
            aria-label={t("settings.server.sync_log_next", "下一页")}
            data-testid="sync-log-next"
          >
            <ChevronRight />
          </Button>
        </div>
      </footer>
    </section>
  );
}

function LogTableRow({ row }: { row: LogRow }) {
  const { t } = useTranslation();
  // Soft tint for terminal-failure states (spec §3.2). Hover from TableRow's
  // base class still wins, so the tint reads as a row-level hint, not noise.
  const bgClass =
    row.status === "dead"
      ? "bg-destructive/5"
      : row.status === "failed"
        ? "bg-warning/5"
        : undefined;

  const deletedSuffix = t("settings.server.sync_log_deleted_suffix", "(已删除)");
  const fallback = `${row.fallbackSyncIdPrefix}…`;

  // 3-way switch on entityType chooses which column gets the bold cell;
  // ancestor cols show the parent name muted, descendants render `—`.
  let workspaceCell: React.ReactNode;
  let collectionCell: React.ReactNode;
  let tabCell: React.ReactNode;

  if (row.entityType === "workspace") {
    workspaceCell = <BoldCell value={row.workspaceName} fallback={fallback} />;
    collectionCell = <DashCell />;
    tabCell = <DashCell />;
  } else if (row.entityType === "collection") {
    workspaceCell = <MutedCell value={row.workspaceName} fallback={fallback} />;
    collectionCell = <BoldCell value={row.collectionName} fallback={fallback} />;
    tabCell = <DashCell />;
  } else {
    workspaceCell = <MutedCell value={row.workspaceName} fallback={fallback} />;
    collectionCell = <MutedCell value={row.collectionName} fallback={fallback} />;
    tabCell =
      row.action === "delete" ? (
        <span className="text-muted-foreground text-sm">{`${fallback} ${deletedSuffix}`}</span>
      ) : (
        <BoldCell value={row.tabTitle} fallback={fallback} />
      );
  }

  return (
    <TableRow className={bgClass} data-testid={`sync-log-row-${row.id}`}>
      <TableCell className="max-w-[180px] truncate">{workspaceCell}</TableCell>
      <TableCell className="max-w-[180px] truncate">{collectionCell}</TableCell>
      <TableCell
        className="max-w-[260px] truncate"
        title={typeof row.tabTitle === "string" ? row.tabTitle : undefined}
      >
        {tabCell}
      </TableCell>
      <TableCell>
        <ActionLabel action={row.action} />
      </TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell className="text-muted-foreground text-sm tabular-nums">
        {formatTs(row.createdAt)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm tabular-nums">
        {row.syncedAt === null ? "—" : formatTs(row.syncedAt)}
      </TableCell>
    </TableRow>
  );
}

function BoldCell({ value, fallback }: { value: string | null; fallback: string }) {
  return <span className="font-medium text-foreground text-sm">{value ?? fallback}</span>;
}

function MutedCell({ value, fallback }: { value: string | null; fallback: string }) {
  return <span className="text-muted-foreground text-sm">{value ?? fallback}</span>;
}

function DashCell() {
  return <span className="text-muted-foreground text-sm">—</span>;
}

function ActionLabel({ action }: { action: LogRow["action"] }) {
  const { t } = useTranslation();
  // syncOutbox stores create / update / delete; UI collapses create+update into
  // the same "upsert" bucket per spec §3.1 since they're indistinguishable to
  // the user (both = "this thing changed").
  if (action === "delete") {
    return (
      <span className="text-destructive text-sm">
        {t("settings.server.sync_log_action_delete", "删除")}
      </span>
    );
  }
  return <span className="text-sm">{t("settings.server.sync_log_action_upsert", "更新")}</span>;
}

function StatusBadge({ status }: { status: LogRow["status"] }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", config.className)}>
      {t(config.labelKey, config.labelFallback)}
    </Badge>
  );
}

function Legend() {
  const { t } = useTranslation();
  const items: LogRow["status"][] = ["synced", "pending", "failed", "dead"];
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="sync-log-legend">
      {items.map((status) => {
        const config = STATUS_CONFIG[status];
        return (
          <div key={status} className="flex items-center gap-1.5">
            <span className={cn("inline-block size-2 rounded-full", config.dotClassName)} />
            <span className="text-muted-foreground text-xs">
              {t(config.labelKey, config.labelFallback)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Tailwind has no built-in success/warning palette here; we lean on emerald /
// blue / amber / rose semantic-ish utilities. Centralized so the badge and
// the legend dot stay in sync if someone swaps tokens later.
const STATUS_CONFIG: Record<
  LogRow["status"],
  { labelKey: string; labelFallback: string; className: string; dotClassName: string }
> = {
  synced: {
    labelKey: "settings.server.sync_log_status_synced",
    labelFallback: "已同步",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
  },
  pending: {
    labelKey: "settings.server.sync_log_status_pending",
    labelFallback: "待同步",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    dotClassName: "bg-blue-500",
  },
  failed: {
    labelKey: "settings.server.sync_log_status_failed",
    labelFallback: "重试中",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    dotClassName: "bg-amber-500",
  },
  dead: {
    labelKey: "settings.server.sync_log_status_dead",
    labelFallback: "已放弃",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    dotClassName: "bg-rose-500",
  },
};

// Locale-default; matches server-info-card / server-paused convention.
// Relative time ("2 分钟前") is a follow-up — would need Intl.RelativeTimeFormat
// + a tick to refresh, which isn't worth it for a debug-leaning view.
function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
