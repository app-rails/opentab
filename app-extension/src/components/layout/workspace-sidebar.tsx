import { useState } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
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
  const reorderWorkspace = useAppStore((s) => s.reorderWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = workspaces.findIndex((w) => w.id === active.id);
    const newIndex = workspaces.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Compute fractional index between the new neighbors AFTER the move
    let lowerBound: string | null = null;
    let upperBound: string | null = null;

    if (newIndex < oldIndex) {
      // Moving up: insert between [newIndex - 1] and [newIndex]
      lowerBound = newIndex > 0 ? workspaces[newIndex - 1].order : null;
      upperBound = workspaces[newIndex].order;
    } else {
      // Moving down: insert between [newIndex] and [newIndex + 1]
      lowerBound = workspaces[newIndex].order;
      upperBound = newIndex < workspaces.length - 1 ? workspaces[newIndex + 1].order : null;
    }

    const newOrder = generateKeyBetween(lowerBound, upperBound);
    reorderWorkspace(active.id as number, newOrder);
  }

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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
        </DndContext>
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
    </aside>
  );
}
