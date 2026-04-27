import { Button } from "@opentab/ui/components/button";
import { cn } from "@opentab/ui/lib/utils";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ThemeToggler } from "@/components/theme-toggler";
import { useLocale } from "@/lib/locale";
import type { SyncSettings } from "@/lib/sync-settings";
import { useTheme } from "@/lib/theme";
import { useSyncSettings } from "@/lib/use-sync-settings";

// 4-state derivation per spec §4.4. Identity tier (avatar bg + label) tracks
// the same axes as the sidebar dot:
//   enabled ∧ auth        → user.name first letter, accent bg
//   enabled ∧ !auth       → "?" gray, "配置中"
//   !enabled ∧ savedConfig → "?" gray, "已暂停"
//   !enabled ∧ !savedConfig → "?" gray, "未登录"
// Avatar+name area is wrapped in <Link to="/server"> so any non-authenticated
// state has an obvious one-click jump back to the wizard.
type Identity = {
  initial: string;
  name: string;
  accent: boolean;
};

function deriveIdentity(s: SyncSettings, t: TFunction): Identity {
  if (s.enabled && s.auth) {
    const display = s.auth.user?.name ?? s.auth.deviceName ?? "已认证";
    const initial = display.trim().charAt(0).toUpperCase() || "?";
    return { initial, name: display, accent: true };
  }
  if (s.enabled) {
    return {
      initial: "?",
      name: t("settings.sidebar.user_status_wizard", "配置中"),
      accent: false,
    };
  }
  if (s.savedConfig) {
    return {
      initial: "?",
      name: t("settings.sidebar.user_status_paused", "已暂停"),
      accent: false,
    };
  }
  return {
    initial: "?",
    name: t("settings.sidebar.user_status_signed_out", "未登录"),
    accent: false,
  };
}

export function UserBar() {
  const { mode } = useTheme();
  const { locale, cycleLocale } = useLocale();
  const { t } = useTranslation();
  const settings = useSyncSettings();
  const identity = deriveIdentity(settings, t);

  const themeLabel = t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) });
  // Inlined like workspace-sidebar.tsx:95-97. Lift to useLocale in Task 32.
  const langLabel =
    locale === "en" ? t("sidebar.language_label_en") : t("sidebar.language_label_zh");
  const langAbbr = locale === "en" ? t("sidebar.language_en") : t("sidebar.language_zh");

  return (
    <div data-testid="user-bar" className="flex items-center gap-2">
      <Link
        to="/server"
        data-testid="user-bar-link"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md hover:opacity-80"
      >
        <span
          data-testid="user-bar-avatar"
          aria-hidden="true"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
            identity.accent
              ? "bg-accent font-medium text-accent-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {identity.initial}
        </span>
        <span
          data-testid="user-bar-name"
          className="min-w-0 truncate text-muted-foreground text-xs"
        >
          {identity.name}
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-0.5">
        <ThemeToggler
          type="icon"
          data-testid="user-bar-theme"
          className="inline-flex size-6 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
          aria-label={themeLabel}
        />
        <Button
          data-testid="user-bar-locale"
          variant="ghost"
          size="icon-xs"
          onClick={cycleLocale}
          aria-label={langLabel}
        >
          <span className="font-medium text-muted-foreground text-xs">{langAbbr}</span>
        </Button>
      </div>
    </div>
  );
}
