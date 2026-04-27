import type { StatsResponse } from "@opentab/protocol";
import { Button } from "@opentab/ui/components/button";
import { Card } from "@opentab/ui/components/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@opentab/ui/components/tooltip";
import { cn } from "@opentab/ui/lib/utils";
import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/db";
import { fetchServerStats } from "@/lib/server-stats-fetch";

interface ServerStatsCardsProps {
  host: string;
  deviceToken: string;
}

type FetchState = { kind: "loading" } | { kind: "ok"; stats: StatsResponse } | { kind: "error" };

/**
 * Sync server panel — three stat cards (workspaces / collections / tabs).
 *
 * Layout per card: server count (M, dominant) ` / ` local count (N, muted).
 * Local counts come from Dexie via `useLiveQuery` (reactive, three independent
 * counts — Dexie batches them efficiently). Server counts come from a single
 * mount-time fetch via `fetchServerStats`; no polling. The retry button bumps
 * a nonce that re-runs the same effect.
 *
 *   states          left side (server)   right side (local)
 *   ─────────────────────────────────────────────────────────
 *   loading         "…"                  N (live)
 *   ok              M (live-ish)         N (live)
 *   error           "?" + retry icon     N (live)
 */
export function ServerStatsCards({ host, deviceToken }: ServerStatsCardsProps) {
  const { t } = useTranslation();

  // Three independent live counts. `deletedAt` stores `null` for active rows
  // (see app-store.ts), so we filter table-scan style — matches the pattern
  // in db-queries.ts. Initial value `0` keeps the right column from blanking
  // on the first undefined tick.
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

  const [fetchState, setFetchState] = useState<FetchState>({ kind: "loading" });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!host || !deviceToken) return;
    let cancelled = false;
    setFetchState({ kind: "loading" });
    fetchServerStats({ host, deviceToken }).then((result) => {
      if (cancelled) return;
      if (result.ok) setFetchState({ kind: "ok", stats: result.stats });
      else setFetchState({ kind: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [host, deviceToken, retryNonce]);

  const handleRetry = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  const items: Array<{ key: keyof StatsResponse; label: string; local: number }> = [
    {
      key: "workspaces",
      label: t("settings.server.stats_workspaces", "工作区"),
      local: localWorkspaces,
    },
    {
      key: "collections",
      label: t("settings.server.stats_collections", "集合"),
      local: localCollections,
    },
    {
      key: "tabs",
      label: t("settings.server.stats_tabs", "标签"),
      local: localTabs,
    },
  ];

  return (
    <TooltipProvider>
      <section data-testid="server-stats-cards" className="flex flex-col gap-3">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("settings.server.stats_section_title", "数据统计")}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {items.map((item) => (
            <StatCard
              key={item.key}
              testKey={item.key}
              label={item.label}
              local={item.local}
              server={fetchState.kind === "ok" ? fetchState.stats[item.key] : null}
              state={fetchState.kind}
              onRetry={handleRetry}
              tooltipFormat={t(
                "settings.server.stats_tooltip",
                "服务器: {{server}} | 本地: {{local}}",
              )}
              retryLabel={t("settings.server.stats_retry", "重试")}
            />
          ))}
        </div>
      </section>
    </TooltipProvider>
  );
}

interface StatCardProps {
  testKey: keyof StatsResponse;
  label: string;
  local: number;
  server: number | null;
  state: FetchState["kind"];
  onRetry: () => void;
  tooltipFormat: string;
  retryLabel: string;
}

function StatCard({
  testKey,
  label,
  local,
  server,
  state,
  onRetry,
  tooltipFormat,
  retryLabel,
}: StatCardProps) {
  const serverDisplay = state === "loading" ? "…" : state === "error" ? "?" : String(server);
  const tooltipText = tooltipFormat
    .replace("{{server}}", state === "ok" ? String(server) : serverDisplay)
    .replace("{{local}}", String(local));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="gap-2 px-4 py-3" data-testid={`stat-card-${testKey}`}>
          <div className="text-muted-foreground text-xs">{label}</div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-semibold text-2xl tabular-nums",
                  state === "error" && "text-destructive",
                  state === "loading" && "text-muted-foreground",
                )}
              >
                {serverDisplay}
              </span>
              <span className="text-muted-foreground text-sm">/</span>
              <span className="text-muted-foreground text-sm tabular-nums">{local}</span>
            </div>
            {state === "error" && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onRetry}
                aria-label={retryLabel}
                data-testid={`stat-card-${testKey}-retry`}
              >
                <RefreshCw />
              </Button>
            )}
          </div>
        </Card>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
