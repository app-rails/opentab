import { useSyncSettings } from "@/lib/use-sync-settings";
import { ServerEmpty } from "./server-empty";
import { ServerPaused } from "./server-paused";

/**
 * `/server` route — pure state dispatcher.
 *
 *   useSyncSettings() shape          →  branch
 *   ────────────────────────────────────────────────────────
 *   !enabled && !savedConfig         →  <ServerEmpty>          (first run)
 *   !enabled &&  savedConfig         →  <ServerPaused>         (toggle off, data kept)
 *    enabled && !auth                →  <ServerWizard>         (T25–T28, placeholder for now)
 *    enabled &&  auth                →  <ServerConnected>      (T17–T24,  placeholder for now)
 *
 * The four branches are mutually exclusive given the SyncSettings shape, so
 * the chain of `return`s is exhaustive without needing a final fallback.
 */
export function ServerPage() {
  const settings = useSyncSettings();

  if (!settings.enabled && !settings.savedConfig) {
    return <ServerEmpty />;
  }
  if (!settings.enabled && settings.savedConfig) {
    return <ServerPaused config={settings.savedConfig} />;
  }
  if (settings.enabled && !settings.auth) {
    return <ServerWizardPlaceholder />;
  }
  return <ServerConnectedPlaceholder />;
}

// Inline placeholders for T25–T28 (wizard) and T17–T24 (connected). They keep
// the dispatcher exhaustive and let the sidebar / routes tests assert routing
// against stable testids while the real panels are still under construction.
function ServerWizardPlaceholder() {
  return <div data-testid="server-wizard-placeholder">WIZARD WIP</div>;
}

function ServerConnectedPlaceholder() {
  return <div data-testid="server-connected-placeholder">CONNECTED WIP</div>;
}
