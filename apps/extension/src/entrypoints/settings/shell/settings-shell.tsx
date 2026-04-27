import { Outlet } from "react-router";
import { SettingsSidebar } from "./settings-sidebar";

// 240px sidebar + flexible content. min-h-0 + overflow-auto keeps the
// content column scrollable independent of the sidebar.
export function SettingsShell() {
  return (
    <div className="grid h-screen grid-cols-[240px_1fr] bg-background text-foreground">
      <SettingsSidebar />
      <main className="min-h-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
