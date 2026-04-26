import type { ReactNode } from "react";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

/**
 * Wraps an authenticated route subtree with the sidebar layout: shadcn
 * `SidebarProvider` + the OpenTab `AppSidebar` + `SidebarInset` for page
 * content. Does not take a `user` prop — sub-components inside the sidebar
 * read the user via `useAuthUser`, matching the admin shell pattern.
 *
 * Mounted by `routes/dash/layout.tsx`, `routes/devices/layout.tsx`, and
 * `routes/settings/layout.tsx` (Tasks 6 / 7) so the three authenticated
 * trees share one chrome.
 */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
