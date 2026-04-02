import type { ImportSource } from "./types";

export function detectFormat(json: unknown): ImportSource | null {
  if (typeof json !== "object" || json === null) return null;

  const obj = json as Record<string, unknown>;

  // TabTab: has space_list (array) + spaces (object)
  if (Array.isArray(obj.space_list) && typeof obj.spaces === "object" && obj.spaces !== null) {
    return "tabtab";
  }

  // OpenTab: has version (number) + workspaces (array)
  if (typeof obj.version === "number" && Array.isArray(obj.workspaces)) {
    return "opentab";
  }

  return null;
}
