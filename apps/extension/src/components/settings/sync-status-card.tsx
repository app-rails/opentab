import { Button } from "@opentab/ui/components/button";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { SyncAuthState } from "@/lib/sync-auth-storage";
import { SyncDisconnectDialog } from "./sync-disconnect-dialog";

const LAST_SYNC_STORAGE_KEY = "opentab_sync_last_sync";

interface SyncStatusCardProps {
  auth: Extract<SyncAuthState, { kind: "authenticated" }>;
  /** Called after the user confirms disconnect. */
  onDisconnected?: () => void;
}

export function SyncStatusCard({ auth, onDisconnected }: SyncStatusCardProps) {
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [pending, setPending] = useState<number>(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [stored, pendingCount] = await Promise.all([
        chrome.storage.local.get(LAST_SYNC_STORAGE_KEY),
        db.syncOutbox.where("status").equals("pending").count(),
      ]);
      const value = (stored as Record<string, unknown>)[LAST_SYNC_STORAGE_KEY];
      setLastSync(typeof value === "number" ? value : null);
      setPending(pendingCount);
    } catch (err) {
      console.warn("[sync-status-card] refresh failed", err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h4 className="font-medium text-sm">Sync connected</h4>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Host</dt>
          <dd className="truncate font-mono text-xs">{auth.host}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Device</dt>
          <dd>{auth.deviceName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Last sync</dt>
          <dd>{lastSync ? new Date(lastSync).toLocaleString() : "Not yet synced"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Pending changes</dt>
          <dd>{pending}</dd>
        </div>
      </dl>
      <div className="pt-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Disconnect
        </Button>
      </div>
      <SyncDisconnectDialog open={open} onOpenChange={setOpen} onDisconnected={onDisconnected} />
    </div>
  );
}
