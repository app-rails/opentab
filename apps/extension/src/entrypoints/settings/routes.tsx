import { createHashRouter } from "react-router";
import { GeneralPage } from "./pages/general-page";
import { ImportExportPage } from "./pages/import-export-page";
import { WelcomePage } from "./pages/welcome-page";
import { SettingsShell } from "./shell/settings-shell";

// Placeholder route components for routes still under construction
// (server). The data-testid hooks are load-bearing: the sidebar test
// asserts routing works against these stubs.
const ServerPagePlaceholder = () => <div data-testid="placeholder-server">WIP</div>;

export const router = createHashRouter([
  {
    path: "/",
    element: <SettingsShell />,
    children: [
      { index: true, element: <WelcomePage /> },
      { path: "general", element: <GeneralPage /> },
      { path: "import-export", element: <ImportExportPage /> },
      { path: "server", element: <ServerPagePlaceholder /> },
    ],
  },
]);
