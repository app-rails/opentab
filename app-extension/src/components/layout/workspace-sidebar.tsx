import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

export function WorkspaceSidebar() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-sidebar p-4">
      <h2 className="mb-4 text-sm font-semibold text-sidebar-foreground">Workspaces</h2>
      <div className="flex-1 space-y-1">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            type="button"
            onClick={() => ws.id != null && setActiveWorkspace(ws.id)}
            className={cn(
              "w-full rounded-md px-3 py-2 text-left text-sm",
              ws.id === activeWorkspaceId
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50",
            )}
          >
            {ws.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
