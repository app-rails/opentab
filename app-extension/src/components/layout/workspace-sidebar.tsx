import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Settings } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { useAppStore } from "@/stores/app-store";

function SortableWorkspaceItem({
  workspace,
  isActive,
  onSelect,
  onRequestDelete,
}: {
  workspace: Workspace;
  isActive: boolean;
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
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
      />
    </div>
  );
}

export function WorkspaceSidebar() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-sidebar p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
          Workspaces
        </h2>
        <Button variant="ghost" size="icon-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-1">
        <SortableContext
          items={workspaces.map((w) => w.id!)}
          strategy={verticalListSortingStrategy}
        >
          {workspaces.map((ws) => (
            <SortableWorkspaceItem
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
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
      />

      <div className="border-t border-border pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/60"
          onClick={() => {
            chrome.tabs.create({ url: chrome.runtime.getURL("/settings.html") });
          }}
        >
          <Settings className="size-4" />
          Settings
        </Button>
      </div>
    </aside>
  );
}
