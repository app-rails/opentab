const EXCLUDED_PREFIXES = ["chrome://", "chrome-extension://"];
const EXCLUDED_URLS = ["", "about:blank"];

export function isValidTab(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number } {
  if (tab.id == null) return false;
  const url = tab.url ?? "";
  if (!url || EXCLUDED_URLS.includes(url)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix));
}
