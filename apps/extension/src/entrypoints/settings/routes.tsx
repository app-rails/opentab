import { createHashRouter } from "react-router";
import { WelcomePage } from "./pages/welcome-page";
import { SettingsShell } from "./shell/settings-shell";

// Placeholder route components for routes still under construction
// (general / import-export / server). The data-testid hooks are load-bearing:
// the sidebar test asserts routing works against these stubs.
const GeneralPagePlaceholder = () => <div data-testid="placeholder-general">WIP</div>;
const ImportExportPagePlaceholder = () => <div data-testid="placeholder-import-export">WIP</div>;
const ServerPagePlaceholder = () => <div data-testid="placeholder-server">WIP</div>;

export const router = createHashRouter([
  {
    path: "/",
    element: <SettingsShell />,
    children: [
      { index: true, element: <WelcomePage /> },
      { path: "general", element: <GeneralPagePlaceholder /> },
      { path: "import-export", element: <ImportExportPagePlaceholder /> },
      { path: "server", element: <ServerPagePlaceholder /> },
    ],
  },
]);
