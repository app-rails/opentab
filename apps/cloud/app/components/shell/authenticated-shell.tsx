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
    // 16rem (--spacing * 64) leaves room for the longest top-level label
    // ("Workspaces") at the inset variant's slightly tighter padding.
    <SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 64)" } as CSSProperties}>
      <a
        href="#main-content"
        className="fixed top-0 left-0 z-[100] -translate-y-full rounded-br-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset id="main-content">{children}</SidebarInset>
    </SidebarProvider>
  );
}
