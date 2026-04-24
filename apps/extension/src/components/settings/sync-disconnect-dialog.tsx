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
import { MSG } from "@/lib/constants";
import { clearSyncAuth } from "@/lib/sync-auth-storage";

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

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      await clearSyncAuth();
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
          <DialogTitle>Disconnect sync?</DialogTitle>
          <DialogDescription>
            Your local workspaces stay on this device. The server still shows this device in its
            list until you revoke it from the Web management panel.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            {busy ? "Disconnecting..." : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
