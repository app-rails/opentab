import { Button } from "@/components/ui/button";

export default function App() {
  const openTabsPage = () => {
    const url = browser.runtime.getURL("/tabs.html");
    browser.tabs.create({ url });
    window.close();
  };

  return (
    <div className="w-[320px] p-4">
      <h1 className="text-lg font-semibold mb-2">OpenTab</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Manage your tabs and workspaces
      </p>
      <Button onClick={openTabsPage} className="w-full">
        Open Dashboard
      </Button>
    </div>
  );
}
