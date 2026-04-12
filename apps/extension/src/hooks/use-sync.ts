import { useEffect } from "react";
import { MSG } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

export function useSync() {
  const refreshAfterSync = useAppStore((s) => s.refreshAfterSync);
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {});
    const handler = (msg: { type: string }) => {
      if (msg.type === MSG.SYNC_APPLIED) refreshAfterSync();
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [refreshAfterSync]);
}
