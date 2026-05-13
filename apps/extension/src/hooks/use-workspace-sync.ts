import { useEffect } from "react";
import { MSG } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

interface WorkspaceChangedMessage {
  type: string;
  workspaceId?: number | null;
}

export function useWorkspaceSync() {
  const applyActiveWorkspaceFromBroadcast = useAppStore((s) => s.applyActiveWorkspaceFromBroadcast);

  useEffect(() => {
    const handler = (msg: WorkspaceChangedMessage) => {
      if (msg.type !== MSG.WORKSPACE_CHANGED) return;
      applyActiveWorkspaceFromBroadcast(msg.workspaceId ?? null);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [applyActiveWorkspaceFromBroadcast]);
}
