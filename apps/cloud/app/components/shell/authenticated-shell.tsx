import type { CSSProperties, ReactNode } from "react";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

/**
 * Wraps an authenticated route subtree with the sidebar layout: shadcn
 * `SidebarProvider` + a sidebar (default `AppSidebar`) + `SidebarInset` for
 * page content. The `sidebar` prop lets `/dash` swap in a workspace-centric
 * sidebar while `/devices`, `/settings`, and `/admin` keep the global one.
 */
export function AuthenticatedShell({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    // 200px per spec §3.7 desktop breakpoint.
    <SidebarProvider style={{ "--sidebar-width": "200px" } as CSSProperties}>
      {sidebar ?? <AppSidebar />}
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
