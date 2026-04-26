import { ChevronsUpDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { UserAvatar } from "~/components/user/user-avatar";
import { UserNavMenuContent } from "~/components/user/user-nav";
import { useAuthUser } from "~/hooks/use-auth-user";
import { getAvatarUrl } from "~/lib/utils";

/**
 * Sidebar-bottom user pill. Whole row is the dropdown trigger; dropdown
 * content is reused from `UserNavMenuContent` to keep behavior in sync
 * with the top-bar `UserNav`.
 *
 * No prop drill — fetches the authenticated user via `useAuthUser`,
 * matching the admin sidebar pattern (`components/admin/layout/nav-user.tsx`).
 *
 * @public
 */
export function SidebarUserCard() {
  const user = useAuthUser();
  const { avatarUrl } = getAvatarUrl(user.image);
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserAvatar image={avatarUrl} name={user.name} size={32} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "top"}
            align="end"
            sideOffset={4}
          >
            <UserNavMenuContent />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
