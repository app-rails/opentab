import { useEffect } from "react";
import { CollectionPanel } from "@/components/layout/collection-panel";
import { LiveTabPanel } from "@/components/layout/live-tab-panel";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { useAppStore } from "@/stores/app-store";

export default function App() {
  const isLoading = useAppStore((s) => s.isLoading);

  useEffect(() => {
    useAppStore.getState().initialize();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-[240px_1fr_320px] bg-background">
      <WorkspaceSidebar />
      <CollectionPanel />
      <LiveTabPanel />
    </div>
  );
}
