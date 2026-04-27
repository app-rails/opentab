import { createHashRouter } from "react-router";
import { SettingsShell } from "./shell/settings-shell";

// Placeholder route components. Real pages land in later tasks
// (welcome / general / import-export / server). The data-testid hooks are
// load-bearing: Task 11's sidebar test uses them to assert routing works.
const WelcomePagePlaceholder = () => <div data-testid="placeholder-welcome">WIP</div>;
const GeneralPagePlaceholder = () => <div data-testid="placeholder-general">WIP</div>;
const ImportExportPagePlaceholder = () => <div data-testid="placeholder-import-export">WIP</div>;
const ServerPagePlaceholder = () => <div data-testid="placeholder-server">WIP</div>;

export const router = createHashRouter([
  {
    path: "/",
    element: <SettingsShell />,
    children: [
      { index: true, element: <WelcomePagePlaceholder /> },
      { path: "general", element: <GeneralPagePlaceholder /> },
      { path: "import-export", element: <ImportExportPagePlaceholder /> },
      { path: "server", element: <ServerPagePlaceholder /> },
    ],
  },
]);
