import type { CSSProperties, ReactNode } from "react";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

/**
 * Wraps an authenticated route subtree with the sidebar layout: shadcn
 * `SidebarProvider` + `AppSidebar` + `SidebarInset` for page content. Used
 * uniformly across `/dash`, `/devices`, `/settings`, and `/admin`.
 */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  return (
    // 200px per spec §3.7 desktop breakpoint.
    <SidebarProvider style={{ "--sidebar-width": "200px" } as CSSProperties}>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
