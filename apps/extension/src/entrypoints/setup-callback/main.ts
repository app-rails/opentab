import { MSG } from "@/lib/constants";
import {
  PENDING_CALLBACK_STORAGE_KEY,
  parseCallbackParams,
  type SetupCallbackPayload,
} from "@/lib/sync-setup/setup-callback-shared";

/**
 * Setup-callback bridge (spec §2.4.5a).
 *
 * Chrome opens this page at `chrome-extension://<id>/setup-callback.html?...`
 * after the `/connect/extension` handoff finishes. Because the wizard tab may
 * be closed by the time the user lands here, we do a durable write first and a
 * best-effort runtime notification second, then auto-close the tab.
 *
 * NOTE: this file has top-level side effects (init() and DOMContentLoaded
 * listener at the bottom). Anything that needs the storage key or payload
 * shape MUST import from `~/lib/sync-setup/setup-callback-shared` instead —
 * importing from this file pulls those side effects into the consumer chunk,
 * which auto-closed the settings tab when the wizard module pulled it in.
 */

const AUTO_CLOSE_DELAY_MS = 1500;

export async function writePendingCallback(payload: SetupCallbackPayload): Promise<void> {
  try {
    await chrome.storage.local.set({ [PENDING_CALLBACK_STORAGE_KEY]: payload });
  } catch (err) {
    // Best effort — the wizard also listens for the runtime message.
    console.warn("[setup-callback] storage.set failed", err);
  }
}

export async function notifyRuntime(payload: SetupCallbackPayload): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: MSG.SYNC_SETUP_CALLBACK, payload });
  } catch {
    // No listener registered (wizard closed) — the durable write has it.
  }
}

export async function autoCloseTab(): Promise<void> {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id !== undefined) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    // fall through to window.close()
  }
  try {
    window.close();
  } catch {
    // best effort — tab remains open, user can close manually.
  }
}

export async function handleCallback(search: string, now: number = Date.now()): Promise<void> {
  const parsed = parseCallbackParams(search);
  const payload: SetupCallbackPayload = { ...parsed, receivedAt: now };

  // Durable write FIRST so the wizard can recover the code even if it's closed.
  await writePendingCallback(payload);

  // Fast-path: runtime message for an already-open wizard.
  await notifyRuntime(payload);

  // Update copy if an error came through (best-effort UI touch).
  if (parsed.error) {
    const headline = document.getElementById("headline");
    const detail = document.getElementById("detail");
    if (headline) headline.textContent = "Authorization failed";
    if (detail) detail.textContent = "You can close this tab and try again from OpenTab.";
  }
}

function init(): void {
  handleCallback(window.location.search).finally(() => {
    setTimeout(() => {
      void autoCloseTab();
    }, AUTO_CLOSE_DELAY_MS);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
