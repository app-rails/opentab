/**
 * Wizard transfer shims (placeholder for T31).
 *
 * Step 4 of the new stepperize wizard (`step-transfer.tsx`) needs to fire
 * "upload local → server" or "download server → local" once the user picks a
 * direction. The real implementations live inline as XState actors inside
 * `components/settings/sync-setup-wizard.tsx`
 * (`uploadBootstrap` / `downloadSnapshot` in the actors map). They depend on a
 * `SyncEngine` instance built from the freshly-issued device token — that
 * instance is held in a wizard-scoped `useRef`, not in chrome.storage, so it
 * isn't reachable from the new step file in isolation.
 *
 * T31 will:
 *   1. extract `uploadBootstrap` / `downloadSnapshot` into this file as
 *      reusable async helpers taking `{ host, deviceToken }`
 *   2. thread the exchange response from `step-authorize` through stepperize
 *      context (or a dedicated wizard provider) so the real `deviceToken`
 *      reaches `step-transfer`
 *   3. delete this throwing stub
 *
 * Until then, calling either helper at runtime explodes loudly so we don't
 * accidentally ship a no-op transfer. Tests mock both functions, so the unit
 * test for `step-transfer` exercises the click → invoke → next() wiring
 * without ever hitting these throws.
 */

export interface WizardTransferInput {
  host: string;
  deviceToken: string;
}

export async function uploadBootstrap(_input: WizardTransferInput): Promise<void> {
  throw new Error(
    "[wizard-transfer] uploadBootstrap stub — the real actor is still inline in " +
      "components/settings/sync-setup-wizard.tsx. T31 extracts it. If you hit " +
      "this in production it means step-transfer was wired before T31 landed.",
  );
}

export async function downloadSnapshot(_input: WizardTransferInput): Promise<void> {
  throw new Error(
    "[wizard-transfer] downloadSnapshot stub — same situation as uploadBootstrap above. " +
      "T31 extracts the real implementation from sync-setup-wizard.tsx.",
  );
}
