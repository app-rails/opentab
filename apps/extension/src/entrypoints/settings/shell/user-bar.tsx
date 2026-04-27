import { Button } from "@opentab/ui/components/button";
import { useTranslation } from "react-i18next";
import { ThemeToggler } from "@/components/theme-toggler";
import { useLocale } from "@/lib/locale";
import { useTheme } from "@/lib/theme";

// Footer for the settings sidebar. Mirrors workspace-sidebar.tsx:94-97 + 270-287
// in spirit (icon ThemeToggler + cycleLocale button + small label) but trims:
// no Tooltip wrapper, no export/import, no settings link. Avatar is a gray
// placeholder until Task 32 (Group 9) wires status dot, username, and tooltip.
export function UserBar() {
  const { mode } = useTheme();
  const { locale, cycleLocale } = useLocale();
  const { t } = useTranslation();

  const themeLabel = t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) });
  // Inlined like workspace-sidebar.tsx:95-97. Lift to useLocale in Task 32.
  const langLabel =
    locale === "en" ? t("sidebar.language_label_en") : t("sidebar.language_label_zh");
  const langAbbr = locale === "en" ? t("sidebar.language_en") : t("sidebar.language_zh");

  return (
    <div data-testid="user-bar" className="flex items-center gap-2">
      {/* Avatar placeholder. Real avatar + status dot lands in Task 32. */}
      <div className="size-6 shrink-0 rounded-full bg-muted" aria-hidden="true" />

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
