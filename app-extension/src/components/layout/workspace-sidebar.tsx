import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, PanelLeft, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

function SortableWorkspaceItem({
  workspace,
  isActive,
  isLastWorkspace,
  onSelect,
  onRequestDelete,
}: {
  workspace: Workspace;
  isActive: boolean;
  isLastWorkspace: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id!,
    data: { type: DRAG_TYPES.WORKSPACE },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WorkspaceItem
        workspace={workspace}
        isActive={isActive}
        isLastWorkspace={isLastWorkspace}
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
      />
    </div>
  );
}

interface WorkspaceSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function WorkspaceSidebar({ collapsed, onToggleCollapse }: WorkspaceSidebarProps) {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  return (
    <div className={cn("relative shrink-0", collapsed ? "w-3" : "")}>
      {/* Expand toggle — always visible outside overflow-hidden */}
      {collapsed && (
        <button
          type="button"
          className="absolute top-3 -right-3 z-10 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
        >
          <ChevronLeft className="size-3.5 rotate-180" />
        </button>
      )}

      <aside
        className={cn(
          "flex h-full flex-col border-r border-border bg-sidebar overflow-hidden transition-[width] duration-200 ease-linear",
          collapsed ? "w-0 border-r-0" : "w-64",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-lg font-semibold text-sidebar-foreground">OpenTab</h1>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleCollapse}
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="size-4" />
          </Button>
        </div>

        {/* Separator */}
        <div className="mx-2 h-[1px] bg-sidebar-border" />

        {/* Spaces header */}
        <div className="relative mb-1 mt-3 flex items-center px-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-sidebar-foreground/70">
            Spaces
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* Workspace list */}
        <div className="flex-1 space-y-0.5 overflow-auto px-2" data-workspace-list>
          <SortableContext
            items={workspaces.map((w) => w.id!)}
            strategy={verticalListSortingStrategy}
          >
            {workspaces.map((ws) => (
              <SortableWorkspaceItem
                key={ws.id}
                workspace={ws}
                isActive={ws.id === activeWorkspaceId}
                isLastWorkspace={workspaces.length <= 1}
                onSelect={() => ws.id != null && setActiveWorkspace(ws.id)}
                onRequestDelete={() => setDeleteTarget(ws)}
              />
            ))}
          </SortableContext>
        </div>

        <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
        <DeleteWorkspaceDialog
          workspaceId={deleteTarget?.id ?? null}
          workspaceName={deleteTarget?.name ?? ""}
          open={deleteTarget != null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          onAfterDelete={() => {
            const sidebar = document.querySelector("[data-workspace-list]");
            const firstItem = sidebar?.querySelector<HTMLElement>('[role="button"]');
            firstItem?.focus();
          }}
        />

        {/* Footer separator */}
        <div className="mx-2 h-[1px] bg-sidebar-border" />

        {/* Footer */}
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sm text-sidebar-foreground/70"
            onClick={() => {
              chrome.tabs.create({ url: chrome.runtime.getURL("/settings.html") });
            }}
          >
            <Settings className="size-4" />
            Settings
          </Button>
        </div>
      </aside>
    </div>
  );
}
