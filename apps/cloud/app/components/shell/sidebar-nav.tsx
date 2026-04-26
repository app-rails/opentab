import { CircleGaugeIcon, LaptopIcon, LayoutDashboardIcon, SettingsIcon } from "lucide-react";
import { href, NavLink } from "react-router";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "~/components/ui/sidebar";
import { useAuthUser } from "~/hooks/use-auth-user";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// `/dash` and `/devices` use plain string paths (matches `routes/layout.tsx`)
// so this component compiles before those route keys exist in RR's type gen.
const DASH_PATH = "/dash";
const DEVICES_PATH = "/devices";

function buildNavItems(role: string | null | undefined): NavItem[] {
  const items: NavItem[] = [
    { to: DASH_PATH, label: "Dashboard", icon: LayoutDashboardIcon },
    { to: DEVICES_PATH, label: "Devices", icon: LaptopIcon },
    { to: href("/settings/account"), label: "Settings", icon: SettingsIcon },
  ];
  if (role === "admin") {
    items.push({ to: href("/admin"), label: "Admin", icon: CircleGaugeIcon });
  }
  return items;
}

/**
 * Primary in-app navigation rendered inside the authenticated sidebar.
 *
 * Active state flows from React Router's `<NavLink>` render prop into
 * `SidebarMenuButton`'s `isActive` prop, which sets `data-active` on the
 * rendered element so shadcn's variant styles light up.
 */
export function SidebarNav() {
  const user = useAuthUser();
  const items = buildNavItems(user.role);

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.to}>
          <NavLink to={item.to} end={item.to === DASH_PATH}>
            {({ isActive }) => (
              <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                <span>
                  <item.icon />
                  <span>{item.label}</span>
                </span>
              </SidebarMenuButton>
            )}
          </NavLink>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
