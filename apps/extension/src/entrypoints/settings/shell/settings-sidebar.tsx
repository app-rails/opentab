import { cn } from "@opentab/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
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

export function SettingsSidebar() {
  const { t } = useTranslation();

  return (
    <nav className="flex h-full flex-col border-border border-r bg-background">
      {/* Logo / title slot. Real branding comes with Task 32. */}
      <div className="px-4 py-5">
        <h1 className="font-semibold text-base">{t("settings.title", "设置")}</h1>
      </div>

      <ul className="flex-1 space-y-1 px-2">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-1.5 font-medium text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )
              }
            >
              {t(item.key, item.fallback)}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Footer slot. UserBar holds avatar placeholder + theme + locale toggles;
          status dot + username land in Task 32 (Group 9). */}
      <div className="border-border border-t px-4 py-3">
        <UserBar />
      </div>
    </nav>
  );
}
