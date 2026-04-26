import {
  Building2Icon,
  CircleGaugeIcon,
  LaptopIcon,
  LayoutDashboardIcon,
  SettingsIcon,
} from "lucide-react";
import { href, Link, useLocation } from "react-router";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "~/components/ui/sidebar";
import { useAuthUser } from "~/hooks/use-auth-user";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * When true, only an exact path match activates this item; otherwise a
   * `currentPath.startsWith(to + "/")` prefix match also counts so subroutes
   * (e.g. `/settings/account`, `/dash/workspace/:id/collection/:cid/edit`)
   * keep their parent item highlighted.
   */
  exact?: boolean;
};

// `/dash`, `/dash/workspace`, and `/devices` use plain string paths so this
// component compiles before those route keys exist in RR's type gen.
const DASH_PATH = "/dash";
const WORKSPACES_PATH = "/dash/workspace";
const DEVICES_PATH = "/devices";

function buildNavItems(role: string | null | undefined): NavItem[] {
  const items: NavItem[] = [
    { to: DASH_PATH, label: "Dashboard", icon: LayoutDashboardIcon, exact: true },
    { to: WORKSPACES_PATH, label: "Workspaces", icon: Building2Icon },
    { to: DEVICES_PATH, label: "Devices", icon: LaptopIcon },
    { to: href("/settings/account"), label: "Settings", icon: SettingsIcon },
  ];
  if (role === "admin") {
    items.push({ to: href("/admin"), label: "Admin", icon: CircleGaugeIcon });
  }
  return items;
}

function isActiveLink(currentPath: string, targetUrl: string, exact = false): boolean {
  if (currentPath === targetUrl) return true;
  if (exact) return false;
  return currentPath.startsWith(`${targetUrl}/`);
}

/**
 * Primary in-app navigation rendered inside the authenticated sidebar.
 *
 * Mirrors the admin `nav-group.tsx` convention: `useLocation()` drives a
 * local `isActiveLink` helper, then `<SidebarMenuButton asChild>` wraps a
 * plain `<Link>` so shadcn's `data-active` / `data-slot` attributes land on
 * the anchor itself rather than on a synthetic span wrapper.
 */
export function SidebarNav() {
  const user = useAuthUser();
  const items = buildNavItems(user.role);
  const { pathname } = useLocation();

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton
            asChild
            isActive={isActiveLink(pathname, item.to, item.exact)}
            tooltip={item.label}
          >
            <Link to={item.to}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
