import { Badge } from "@opentab/ui/components/badge";
import { Button } from "@opentab/ui/components/button";
import { Card, CardHeader } from "@opentab/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@opentab/ui/components/dropdown-menu";
import { Switch } from "@opentab/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@opentab/ui/components/tooltip";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Hero state matrix (spec §4.3):
 *
 *   state          │ Switch │ Sync now button │ Overflow menu
 *   ───────────────┼────────┼─────────────────┼─────────────────────────────
 *   empty          │  OFF   │       —         │ —
 *   paused         │  OFF   │       —         │ 忘记此服务器
 *   wizard         │  ON    │       —         │ —  (avoid deleting half-built config)
 *   reconnecting   │  ON    │   disabled      │ 忘记此服务器
 *   connected      │  ON    │   primary  ✓    │ 重新配置 / 复制设备 ID / 忘记此服务器
 *
 * Props are intentionally callback-only (no direct chrome.storage / message
 * sending). Each parent (T16 empty/paused, T24 connected, T31 reconfigure)
 * decides what to do on switch flips and menu clicks. That keeps this file
 * pure and the same component reusable across five distinct call sites.
 */

export type ServerHeroState = "empty" | "paused" | "wizard" | "reconnecting" | "connected";

export interface ServerHeroProps {
  state: ServerHeroState;
  /** savedConfig.host – rendered in subtitle for paused/reconnecting/connected. */
  host?: string;
  /** Inline trailing text after the sync now button (e.g. "最后同步 N 分钟前"). */
  syncedAtLabel?: string;
  onSwitchChange: (enabled: boolean) => void;
  onSyncNow?: () => void;
  onForgetServer?: () => void;
  onReconfigure?: () => void;
  onCopyDeviceId?: () => void;
}

export function ServerHero({
  state,
  host,
  syncedAtLabel,
  onSwitchChange,
  onSyncNow,
  onForgetServer,
  onReconfigure,
  onCopyDeviceId,
}: ServerHeroProps) {
  const { t } = useTranslation();
  const isSwitchOn = state === "wizard" || state === "reconnecting" || state === "connected";
  const showSyncNow = state === "reconnecting" || state === "connected";
  const syncNowDisabled = state === "reconnecting";
  const showMenu = state === "paused" || state === "reconnecting" || state === "connected";
  const showReconfigureItem = state === "connected";
  const showCopyDeviceIdItem = state === "connected";

  // Status badge color matrix per state. Tailwind utility-only so dark-mode
  // picks them up without extra wiring.
  const status =
    state === "empty"
      ? {
          label: t("settings.server.status_empty", "未启用"),
          className: "border-muted-foreground/30 text-muted-foreground",
        }
      : state === "paused"
        ? {
            label: t("settings.server.status_paused", "已暂停"),
            className: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
          }
        : state === "wizard"
          ? {
              label: t("settings.server.status_wizard", "配置中"),
              className: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
            }
          : state === "reconnecting"
            ? {
                label: t("settings.server.status_reconnecting", "重连中"),
                className: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
              }
            : {
                label: t("settings.server.status_connected", "已连接"),
                className:
                  "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
              };

  const subtitle =
    state === "empty"
      ? t("settings.server.empty_subtitle", "把工作区和标签同步到你登录的其他设备。")
      : state === "paused"
        ? t("settings.server.paused_subtitle", "已暂停。打开开关后会用之前的认证信息重新连接。")
        : state === "wizard"
          ? t("settings.server.wizard_subtitle", "正在配置服务器,跟随向导完成几步即可。")
          : state === "reconnecting"
            ? host
              ? t("settings.server.reconnecting_subtitle_with_host", `正在重新连接到 ${host}…`)
              : t("settings.server.reconnecting_subtitle", "正在重新连接…")
            : host
              ? t("settings.server.connected_subtitle_with_host", `已连接到 ${host}`)
              : t("settings.server.connected_subtitle", "已连接");

  const switchTooltip =
    state === "empty"
      ? t("settings.server.switch_tooltip_enable", "启用同步")
      : state === "paused"
        ? t("settings.server.switch_tooltip_resume", "启用(自动重连)")
        : state === "wizard"
          ? t("settings.server.switch_tooltip_pause_wizard", "暂停设置")
          : t("settings.server.switch_tooltip_pause", "暂停同步");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold leading-none">
              {t("settings.server.title", "服务器同步")}
            </span>
            <Badge
              data-testid="server-hero-status-badge"
              variant="secondary"
              className={status.className}
            >
              {status.label}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {showSyncNow && (
            <Button
              data-testid="server-hero-sync-now"
              size="sm"
              variant="default"
              disabled={syncNowDisabled}
              onClick={() => onSyncNow?.()}
            >
              <RefreshCw aria-hidden="true" />
              {t("settings.server.sync_now", "立即同步")}
              {syncedAtLabel && (
                <span className="ml-1 font-normal text-primary-foreground/80 text-xs">
                  · {syncedAtLabel}
                </span>
              )}
            </Button>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Switch
                  checked={isSwitchOn}
                  onCheckedChange={onSwitchChange}
                  aria-label={switchTooltip}
                />
              </TooltipTrigger>
              <TooltipContent>{switchTooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-testid="server-hero-menu-trigger"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("settings.server.more_actions", "更多操作")}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showReconfigureItem && (
                  <DropdownMenuItem
                    data-testid="server-hero-menu-reconfigure"
                    onSelect={() => onReconfigure?.()}
                  >
                    {t("settings.server.menu_reconfigure", "重新配置")}
                  </DropdownMenuItem>
                )}
                {showCopyDeviceIdItem && (
                  <DropdownMenuItem
                    data-testid="server-hero-menu-copy-device-id"
                    onSelect={() => onCopyDeviceId?.()}
                  >
                    {t("settings.server.menu_copy_device_id", "复制设备 ID")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  data-testid="server-hero-menu-forget"
                  variant="destructive"
                  onSelect={() => onForgetServer?.()}
                >
                  {t("settings.server.menu_forget", "忘记此服务器")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
