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
   * (e.g. `/dash/workspace/:id/collection/:cid/edit`) keep their parent item
   * highlighted. Ignored when `activePath` is set.
   */
  exact?: boolean;
  /**
   * Override the path used to compute the active state. Set this when the
   * link target (`to`) is a leaf URL like `/dash/settings/account` but the
   * item should also light up across its sibling pages (e.g. on
   * `/dash/settings/appearance`). The active rule is then
   * `currentPath === activePath || currentPath.startsWith(activePath + "/")`.
   */
  activePath?: string;
};

// `/dash`, `/dash/workspace`, and `/dash/devices` use plain string paths so
// this component compiles before those route keys exist in RR's type gen.
const DASH_PATH = "/dash";
const WORKSPACES_PATH = "/dash/workspace";
const DEVICES_PATH = "/dash/devices";
const SETTINGS_ROOT = "/dash/settings";

function buildNavItems(role: string | null | undefined): NavItem[] {
  const items: NavItem[] = [
    { to: DASH_PATH, label: "Dashboard", icon: LayoutDashboardIcon, exact: true },
    { to: WORKSPACES_PATH, label: "Workspaces", icon: Building2Icon },
    { to: DEVICES_PATH, label: "Devices", icon: LaptopIcon },
    {
      to: href("/dash/settings/account"),
      label: "Settings",
      icon: SettingsIcon,
      activePath: SETTINGS_ROOT,
    },
  ];
  if (role === "admin") {
    items.push({ to: href("/admin"), label: "Admin", icon: CircleGaugeIcon });
  }
  return items;
}

function isActiveLink(currentPath: string, item: NavItem): boolean {
  const matchPath = item.activePath ?? item.to;
  if (currentPath === matchPath) return true;
  if (item.exact) return false;
  return currentPath.startsWith(`${matchPath}/`);
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
          <SidebarMenuButton asChild isActive={isActiveLink(pathname, item)} tooltip={item.label}>
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
