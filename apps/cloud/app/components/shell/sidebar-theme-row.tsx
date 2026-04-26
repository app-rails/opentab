import { ThemeSwitcher } from "~/components/theme";

/**
 * Sidebar-bottom fixed row that hosts the existing ThemeSwitcher.
 * Pure rendering wrapper — does not duplicate ThemeSwitcher state.
 * @public
 */
export function SidebarThemeRow() {
  return (
    <div className="px-2 pb-2">
      <ThemeSwitcher />
    </div>
  );
}
