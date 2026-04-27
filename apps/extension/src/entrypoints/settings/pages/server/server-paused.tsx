import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@opentab/ui/components/card";
import { useTranslation } from "react-i18next";
import type { SyncSettings } from "@/lib/sync-settings";

interface ServerPausedProps {
  config: NonNullable<SyncSettings["savedConfig"]>;
}

/**
 * Sync server panel — paused state (toggle off, savedConfig still on disk).
 *
 * Shows a read-only host/lastUsedAt card so the user can see what they had
 * configured before, plus a hint banner explaining the data is preserved.
 * No interactive "forget server" action yet — T23/T31 wire that via the
 * Switch + overflow menu. Hero Switch is a placeholder (see ServerEmpty).
 */
export function ServerPaused({ config }: ServerPausedProps) {
  const { t } = useTranslation();
  const lastUsed = formatLastUsed(config.lastUsedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-10" data-testid="server-paused">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-6">
          <div className="space-y-1.5">
            <CardTitle>{t("settings.server.title", "服务器同步")}</CardTitle>
            <CardDescription>
              {t(
                "settings.server.paused_subtitle",
                "已暂停。打开开关后会用之前的认证信息重新连接。",
              )}
            </CardDescription>
          </div>
          <SwitchPlaceholder />
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {t("settings.server.paused_host_label", "服务器地址")}
            </span>
            <span className="break-all font-mono text-sm">{config.host}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {t("settings.server.paused_last_used_label", "上次使用")}
            </span>
            <span className="text-muted-foreground text-sm">{lastUsed}</span>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border border-dashed bg-muted/30 px-4 py-3 text-muted-foreground text-sm">
        {t(
          "settings.server.paused_hint",
          "💡 配置数据保留在本地,不会因为关闭同步丢失。如果想彻底清除并重新设置,点 [忘记此服务器]。",
        )}
      </div>
    </div>
  );
}

// Same placeholder shape as ServerEmpty's. T23 will extract a shared hero.
function SwitchPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-6 w-11 shrink-0 rounded-full bg-muted"
      data-testid="server-switch-placeholder"
    />
  );
}

// Locale-agnostic timestamp; the navigator default keeps the format readable
// in both zh and en without pulling in a date library.
function formatLastUsed(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
