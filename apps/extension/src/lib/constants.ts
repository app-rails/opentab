export const WORKSPACE_ICON_OPTIONS = [
  "folder",
  "briefcase",
  "home",
  "code",
  "shopping-cart",
  "search",
  "book",
  "music",
  "camera",
  "heart",
  "star",
  "globe",
  "zap",
  "coffee",
  "gamepad-2",
  "graduation-cap",
  "plane",
  "palette",
  "flask-conical",
  "newspaper",
  "wallet",
  "dumbbell",
  "utensils",
  "clapperboard",
] as const;

export type WorkspaceIconName = (typeof WORKSPACE_ICON_OPTIONS)[number];

export const DEFAULT_ICON: WorkspaceIconName = "folder";

export const WORKSPACE_NAME_MAX_LENGTH = 50;

export const MSG = {
  TAB_CREATED: "TAB_CREATED",
  TAB_REMOVED: "TAB_REMOVED",
  TAB_UPDATED: "TAB_UPDATED",
  SETTINGS_CHANGED: "SETTINGS_CHANGED",
} as const;
