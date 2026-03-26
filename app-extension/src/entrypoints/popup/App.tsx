import { Button } from "@/components/ui/button";

export default function App() {
  const openOrFocusDashboard = async () => {
    const tabsUrl = browser.runtime.getURL("/tabs.html");
    const existingTabs = await browser.tabs.query({ url: tabsUrl });

    if (existingTabs.length > 0 && existingTabs[0].id != null) {
      await browser.tabs.update(existingTabs[0].id, { active: true });
      if (existingTabs[0].windowId != null) {
        await browser.windows.update(existingTabs[0].windowId, { focused: true });
      }
    } else {
      await browser.tabs.create({ url: tabsUrl });
    }

    window.close();
  };

  return (
    <div className="w-[320px] p-4">
      <h1 className="text-lg font-semibold mb-2">OpenTab</h1>
      <p className="text-sm text-muted-foreground mb-4">Manage your tabs and workspaces</p>
      <Button onClick={openOrFocusDashboard} className="w-full">
        Open Dashboard
      </Button>
    </div>
  );
}
