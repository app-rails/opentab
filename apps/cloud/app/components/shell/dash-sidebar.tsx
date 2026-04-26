import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { Link, useLocation, useMatches, unstable_useRoute as useRoute } from "react-router";
import { AppLogo } from "~/components/app-logo";
import { SidebarThemeRow } from "~/components/shell/sidebar-theme-row";
import { SidebarUserCard } from "~/components/shell/sidebar-user-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "~/components/ui/sidebar";
import type { DashLayoutLoaderData } from "~/routes/dash/layout";

/**
 * Workspace-centric sidebar mounted under `/dash/*` routes via
 * `routes/dash/layout.tsx`. Replaces the global `AppSidebar` while inside the
 * dashboard. Pulls workspace data from the dash layout loader so we don't
 * re-query — see `loadDashLayout`.
 */
export function DashSidebar() {
  const route = useRoute("routes/dash/layout");
  const data = route?.loaderData as DashLayoutLoaderData | undefined;
  const workspaces = data?.workspaces ?? [];

  const { pathname } = useLocation();
  const activeWorkspaceSyncId = useActiveWorkspaceSyncId();
  const isOnDashIndex = pathname === "/dash";

  return (
    <Sidebar className="group-data-[side=left]:border-border/50">
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
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isOnDashIndex} tooltip="Back to Dashboard">
                <Link to="/dash">
                  <ArrowLeftIcon />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Create workspace">
                <Link to="/dash/workspace/new">
                  <PlusIcon />
                  <span>Create workspace</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>
            Workspaces
            {workspaces.length > 0 && (
              <span className="ml-auto text-muted-foreground text-xs tabular-nums">
                {workspaces.length}
              </span>
            )}
          </SidebarGroupLabel>
          {workspaces.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground text-xs">No workspaces yet.</p>
          ) : (
            <SidebarMenu>
              {workspaces.map((ws) => (
                <SidebarMenuItem key={ws.syncId}>
                  <SidebarMenuButton
                    asChild
                    isActive={ws.syncId === activeWorkspaceSyncId}
                    tooltip={ws.name}
                  >
                    <Link to={`/dash/workspace/${ws.syncId}`}>
                      <span aria-hidden className="text-base leading-none">
                        {ws.icon ?? "🗂️"}
                      </span>
                      <span className="truncate">{ws.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarThemeRow />
        <SidebarUserCard />
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * Reads the active workspace sync ID from `useMatches` so deep nested routes
 * (e.g. `/dash/workspace/:wsId/collection/:colId/edit`) still light up the
 * correct sidebar item. Falls back to undefined when no workspace param is in
 * the match chain.
 */
function useActiveWorkspaceSyncId(): string | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const params = match?.params as { workspaceSyncId?: string } | undefined;
    if (params?.workspaceSyncId) return params.workspaceSyncId;
  }
  return undefined;
}
