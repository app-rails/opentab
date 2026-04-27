import { createHashRouter } from "react-router";
import { GeneralPage } from "./pages/general-page";
import { ImportExportPage } from "./pages/import-export-page";
import { ServerPage } from "./pages/server/server-page";
import { WelcomePage } from "./pages/welcome-page";
import { SettingsShell } from "./shell/settings-shell";

export const router = createHashRouter([
  {
    path: "/",
    element: <SettingsShell />,
    children: [
      { index: true, element: <WelcomePage /> },
      { path: "general", element: <GeneralPage /> },
      { path: "import-export", element: <ImportExportPage /> },
      { path: "server", element: <ServerPage /> },
    ],
  },
]);
