import {
  CircleGaugeIcon,
  LaptopIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { href, Link, NavLink, Outlet } from "react-router";
import { AppLogo } from "~/components/app-logo";
import { buttonVariants } from "~/components/ui/button";
import { UserNav } from "~/components/user/user-nav";
import { useOptionalAuthUser } from "~/hooks/use-auth-user";
import { cn } from "~/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// `/dash` and `/devices` are declared in subsequent tasks; use plain string
// paths here so this layout can land independently without the RR type gen
// complaining about unknown route keys.
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

export default function AuthenticatedLayout() {
  const user = useOptionalAuthUser();
  const navItems = user ? buildNavItems(user.role) : [];

  return (
    <>
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-4 p-4 sm:px-10">
          <div className="flex items-center gap-6">
            <Link to={href("/")} className="flex items-center gap-2">
              <AppLogo />
            </Link>
            {user ? (
              <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === DASH_PATH}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground",
                        isActive && "bg-accent font-medium text-foreground",
                      )
                    }
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <UserNav />
            ) : (
              <Link
                to={href("/auth/sign-in")}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <UserIcon className="size-4" />
                Sign In
              </Link>
            )}
          </div>
        </div>
        {user ? (
          <nav
            className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden"
            aria-label="Primary (mobile)"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === DASH_PATH}
                className={({ isActive }) =>
                  cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground",
                    isActive && "bg-accent font-medium text-foreground",
                  )
                }
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-3xl p-4 sm:p-10">
        <Outlet />
      </main>
    </>
  );
}
