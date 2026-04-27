import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@opentab/ui/components/tooltip";
import { cn } from "@opentab/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import type { SyncSettings } from "@/lib/sync-settings";
import { useSyncSettings } from "@/lib/use-sync-settings";
import { UserBar } from "./user-bar";

// Sidebar nav items. Order matches spec §4.2: welcome → general →
// import/export → server. i18n keys land in Task 33; for now use the
// react-i18next defaultValue fallback so the UI renders meaningful text
// even before locales/{en,zh}.json picks up the keys.
const NAV_ITEMS = [
  { to: "/", end: true, key: "settings.sidebar.welcome_link", fallback: "欢迎页" },
  { to: "/general", end: false, key: "settings.sidebar.nav_general", fallback: "通用设置" },
  {
    to: "/import-export",
    end: false,
    key: "settings.sidebar.nav_import_export",
    fallback: "导入导出",
  },
  { to: "/server", end: false, key: "settings.sidebar.nav_server", fallback: "服务器" },
] as const;

// 4-state derivation per spec §4.2. The dot color tracks user intent + auth:
//   !enabled ∧ !savedConfig  → gray   "未启用"
//   !enabled ∧  savedConfig  → gray   "已暂停"
//    enabled ∧ !auth         → yellow "配置中"
//    enabled ∧  auth         → green  "已启用"
type ServerNavStatus = "empty" | "paused" | "wizard" | "active";

function deriveServerStatus(s: SyncSettings): ServerNavStatus {
  if (!s.enabled) return s.savedConfig ? "paused" : "empty";
  return s.auth ? "active" : "wizard";
}

const STATUS_DOT_CLASS: Record<ServerNavStatus, string> = {
  empty: "bg-muted-foreground/40",
  paused: "bg-muted-foreground/40",
  wizard: "bg-amber-500",
  active: "bg-emerald-500",
};

export function SettingsSidebar() {
  const { t } = useTranslation();
  const settings = useSyncSettings();
  const serverStatus = deriveServerStatus(settings);

  const STATUS_LABEL: Record<ServerNavStatus, string> = {
    empty: t("settings.sidebar.server_status_empty", "未启用"),
    paused: t("settings.sidebar.server_status_paused", "已暂停"),
    wizard: t("settings.sidebar.server_status_wizard", "配置中"),
    active: t("settings.sidebar.server_status_active", "已启用"),
  };

  const STATUS_TOOLTIP: Record<ServerNavStatus, string> = {
    empty: t("settings.sidebar.server_tooltip_empty", "点击进入设置同步"),
    paused: t("settings.sidebar.server_tooltip_paused", "已暂停 · 打开开关恢复"),
    wizard: t("settings.sidebar.server_tooltip_wizard", "正在走设置向导"),
    active: t("settings.sidebar.server_tooltip_active", "已连接 · 同步进行中"),
  };

  return (
    <nav className="flex h-full flex-col border-border border-r bg-background">
      {/* Logo / title slot. */}
      <div className="px-4 py-5">
        <h1 className="font-semibold text-base">{t("settings.title", "设置")}</h1>
      </div>

      <ul className="flex-1 space-y-1 px-2">
        {NAV_ITEMS.map((item) => {
          const isServer = item.to === "/server";
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )
                }
              >
                {isServer ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          data-testid="settings-sidebar-server-dot"
                          role="img"
                          aria-label={STATUS_TOOLTIP[serverStatus]}
                          className={cn(
                            "inline-block size-2 shrink-0 rounded-full",
                            STATUS_DOT_CLASS[serverStatus],
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{STATUS_TOOLTIP[serverStatus]}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
                <span className="flex-1">{t(item.key, item.fallback)}</span>
                {isServer && (
                  <span
                    data-testid="settings-sidebar-server-label"
                    className="text-muted-foreground text-xs"
                  >
                    {STATUS_LABEL[serverStatus]}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className="border-border border-t px-4 py-3">
        <UserBar />
      </div>
    </nav>
  );
}
