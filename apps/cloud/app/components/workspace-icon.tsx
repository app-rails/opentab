import { cn } from "~/lib/utils";
import { DEFAULT_WORKSPACE_ICON_COMPONENT, WORKSPACE_ICONS } from "~/lib/workspace-icons";

/**
 * Workspace icon renderer. Three cases:
 * 1. `value` is a known kebab-case lucide name → render the matching component
 * 2. `value` contains non-ASCII chars (legacy emoji icons like "💼") →
 *    render the raw string as text
 * 3. Anything else (null, empty, unknown kebab name like "video") →
 *    fall back to the default Folder icon
 *
 * This keeps the cloud rendering aligned with the extension's IconPicker
 * while gracefully handling legacy data that the canonical
 * WORKSPACE_ICON_OPTIONS list no longer covers.
 */
export function WorkspaceIcon({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (value && WORKSPACE_ICONS[value]) {
    const Icon = WORKSPACE_ICONS[value];
    return <Icon aria-hidden className={cn("size-4 shrink-0", className)} />;
  }

  if (value && isLikelyEmoji(value)) {
    return (
      <span aria-hidden className={cn("inline-flex shrink-0 items-center text-base", className)}>
        {value}
      </span>
    );
  }

  const Fallback = DEFAULT_WORKSPACE_ICON_COMPONENT;
  return <Fallback aria-hidden className={cn("size-4 shrink-0", className)} />;
}

function isLikelyEmoji(value: string): boolean {
  // Anything outside ASCII (basic letters, digits, hyphen, underscore) is
  // treated as an emoji or pictograph. Lucide names are strict kebab-case
  // ASCII, so this safely separates the two cases without a full unicode
  // emoji table.
  return /[^\x20-\x7E]/.test(value);
}
