import { useEffect } from "react";
import { MSG } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

export function useLiveTabSync() {
  const setLiveTabs = useAppStore((s) => s.setLiveTabs);
  const addLiveTab = useAppStore((s) => s.addLiveTab);
  const removeLiveTab = useAppStore((s) => s.removeLiveTab);
  const updateLiveTab = useAppStore((s) => s.updateLiveTab);

  useEffect(() => {
    let currentWindowId: number | undefined;

    // Get current window ID, then load tabs
    chrome.windows.getCurrent().then((win) => {
      currentWindowId = win.id;
      chrome.tabs.query({ windowId: currentWindowId }).then(setLiveTabs);
    });

    // Listen for background SW messages
    function handleMessage(message: {
      type: string;
      tab?: chrome.tabs.Tab;
      tabId?: number;
      windowId?: number;
      changeInfo?: chrome.tabs.OnUpdatedInfo;
    }) {
      if (currentWindowId == null) return;

      switch (message.type) {
        case MSG.TAB_CREATED:
          if (message.tab && message.tab.windowId === currentWindowId) {
            addLiveTab(message.tab);
          }
          break;
        case MSG.TAB_REMOVED:
          if (message.windowId === currentWindowId && message.tabId != null) {
            removeLiveTab(message.tabId);
          }
          break;
        case MSG.TAB_UPDATED:
          if (
            message.tab?.windowId === currentWindowId &&
            message.tabId != null &&
            message.changeInfo
          ) {
            updateLiveTab(message.tabId, message.changeInfo);
          }
          break;
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [setLiveTabs, addLiveTab, removeLiveTab, updateLiveTab]);
}
