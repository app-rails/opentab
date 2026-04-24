export const appName = "OpenTab";
export const appDescription = "Sync your OpenTab workspaces across devices.";

export const cookiePrefix = appName
  .toLowerCase()
  .replace(/[^a-z\s]/g, "")
  .replace(/\s+/g, "-");
