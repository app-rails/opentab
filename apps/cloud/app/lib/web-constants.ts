/**
 * Web UI constants — mirrors a subset of extension constants for the Web
 * editor so that workspace icons surface a consistent vocabulary across both
 * clients. Keep this list in lockstep with
 * `apps/extension/src/lib/constants.ts` when adding new icons.
 */
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

export const DEFAULT_WORKSPACE_ICON: WorkspaceIconName = "folder";
