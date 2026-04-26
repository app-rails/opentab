import { Button } from "@opentab/ui/components/button";
import { useCallback, useEffect, useState } from "react";
import { MSG } from "@/lib/constants";
import { db } from "@/lib/db";
import type { SyncAuthState } from "@/lib/sync-auth-storage";
import { SyncDisconnectDialog } from "./sync-disconnect-dialog";

interface SyncStatusCardProps {
  auth: Extract<SyncAuthState, { kind: "authenticated" }>;
  /** Called after the user confirms disconnect. */
  onDisconnected?: () => void;
}

export function SyncStatusCard({ auth, onDisconnected }: SyncStatusCardProps) {
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [pending, setPending] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Both reads come from the local Dexie DB — that's the single source of
  // truth the engine writes to (`db.syncMeta.lastSyncAt` after every
  // successful sync, `db.syncOutbox` for queued writes). An earlier version
  // tried to read lastSync from `chrome.storage.local.opentab_sync_last_sync`,
  // which the engine never writes — so the card was permanently stuck on
  // "Not yet synced" no matter how many syncs ran.
  const refresh = useCallback(async () => {
    try {
      const [meta, pendingCount] = await Promise.all([
        db.syncMeta.get("lastSyncAt"),
        db.syncOutbox.where("status").equals("pending").count(),
      ]);
      setLastSync(typeof meta?.value === "number" ? meta.value : null);
      setPending(pendingCount);
    } catch (err) {
      console.warn("[sync-status-card] refresh failed", err);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-poll on every sync tick so the user sees pending drain in real
    // time as bg flushes the post-wizard backlog. SYNC_PROGRESS fires on
    // every sync(), SYNC_APPLIED only when a pull brought in remote data —
    // we listen to both so the card stays current regardless of which path
    // the engine took.
    const listener = (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const type = (message as { type?: unknown }).type;
      if (type === MSG.SYNC_PROGRESS || type === MSG.SYNC_APPLIED) {
        // SYNC_PROGRESS arrives at the end of every engine.sync(), so it's
        // also our signal that an in-flight manual "Sync now" finished.
        setSyncing(false);
        refresh();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  const handleSyncNow = useCallback(() => {
    // Fire-and-forget: bg's onMessage handler invokes syncEngine.sync().
    // We rely on the SYNC_PROGRESS broadcast at the end of that cycle to
    // flip syncing back to false (handled in the listener above), so the
    // button accurately mirrors engine state instead of timing out blindly.
    setSyncing(true);
    chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {
      // No bg listener (e.g., service worker not running in tests) — drop
      // the busy state so the button doesn't get stuck.
      setSyncing(false);
    });
  }, []);

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
      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={handleSyncNow} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Disconnect
        </Button>
      </div>
      <SyncDisconnectDialog open={open} onOpenChange={setOpen} onDisconnected={onDisconnected} />
    </div>
  );
}
