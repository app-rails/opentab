import { Button } from "@opentab/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@opentab/ui/components/dialog";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { MSG } from "@/lib/constants";
import { clearSyncAuth } from "@/lib/sync-auth-storage";
import { clearProgress as clearSyncSetupProgress } from "@/lib/sync-setup/wizard-progress";

/**
 * Disconnect confirmation (spec decision 20).
 *
 * Disconnect is extension-side only: we clear the stored auth and broadcast
 * `SYNC_DISCONNECTED` so the background sync engine tears down its alarm.
 * We intentionally do NOT call the server's device-revoke endpoint — the
 * device row should remain until the user revokes it via the Web management
 * panel (so audit history isn't lost on an accidental reconnect).
 */

interface SyncDisconnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful disconnect (dialog already closed). */
  onDisconnected?: () => void;
}

export function SyncDisconnectDialog({
  open,
  onOpenChange,
  onDisconnected,
}: SyncDisconnectDialogProps) {
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation();

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      await clearSyncAuth();
      // Wipe the wizard's persisted progress so a future reconnect starts
      // from a clean Backup → Connect → Authorize → Transfer chain instead
      // of inheriting stale step ticks from the previous session.
      clearSyncSetupProgress();
      try {
        await chrome.runtime.sendMessage({ type: MSG.SYNC_DISCONNECTED });
      } catch {
        // No listener — the background will reconcile on next startup.
      }
      onOpenChange(false);
      onDisconnected?.();
    } finally {
      setBusy(false);
    }
  }, [onOpenChange, onDisconnected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.sync.disconnect.title")}</DialogTitle>
          <DialogDescription>{t("settings.sync.disconnect.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("settings.sync.disconnect.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {busy
              ? t("settings.sync.disconnect.confirming")
              : t("settings.sync.disconnect.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
