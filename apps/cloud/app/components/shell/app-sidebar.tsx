import type * as React from "react";
import { Link } from "react-router";
import { AppLogo } from "~/components/app-logo";
import { SidebarNav } from "~/components/shell/sidebar-nav";
import { SidebarThemeRow } from "~/components/shell/sidebar-theme-row";
import { SidebarUserCard } from "~/components/shell/sidebar-user-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

/**
 * Authenticated shell's left sidebar.
 *
 * Composes the same primitive shape as `components/admin/layout/sidebar.tsx`
 * (Header logo + Content + Footer) but swaps in the OpenTab-specific
 * `SidebarNav` and a footer that stacks `SidebarThemeRow` (theme segmented
 * control) above `SidebarUserCard` (user pill / dropdown). Sub-components
 * pull the authenticated user via `useAuthUser` so this shell takes no
 * `user` prop, matching the admin pattern.
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    // Intentionally NOT using variant="inset" (admin uses it). Spec §3.1's
    // wireframe shows a plain sidebar+main layout, not a card-in-frame.
    <Sidebar className="group-data-[side=left]:border-border/50" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link to="/">
                <AppLogo />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarNav />
      </SidebarContent>
      <SidebarFooter>
        <SidebarThemeRow />
        <SidebarUserCard />
      </SidebarFooter>
    </Sidebar>
  );
}
