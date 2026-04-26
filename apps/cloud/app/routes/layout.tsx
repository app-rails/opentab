import { Outlet } from "react-router";

/**
 * Root layout for routes that previously shared the global top-bar chrome.
 * The chrome itself now lives inside each authenticated subtree (see the
 * `AuthenticatedShell` wrapper in dash/devices/settings layouts), so this
 * file is intentionally a thin Outlet wrapper.
 */
export default function RootLayout() {
  return <Outlet />;
}
