import { EllipsisVertical, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AboutPage } from "@/components/layout/about-page";
import { SearchDialog } from "@/components/layout/search-dialog";
import { CollectionCard } from "@/components/collection/collection-card";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { DeleteCollectionDialog } from "@/components/collection/delete-collection-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TabCollection } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface CollectionPanelProps {
  isZenMode: boolean;
  onToggleZenMode: () => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
}

export function CollectionPanel({
  isZenMode,
  onToggleZenMode,
  searchOpen,
  onSearchOpenChange,
}: CollectionPanelProps) {
  const collections = useAppStore((s) => s.collections);
  const tabsByCollection = useAppStore((s) => s.tabsByCollection);
  const activeWorkspace = useAppStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null,
  );
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TabCollection | null>(null);
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  function startRename() {
    if (!activeWorkspace) return;
    setRenameValue(activeWorkspace.name);
    setIsRenaming(true);
  }

  function confirmRename() {
    const trimmed = renameValue.trim();
    if (trimmed && activeWorkspace?.id != null && trimmed !== activeWorkspace.name) {
      renameWorkspace(activeWorkspace.id, trimmed);
    }
    setIsRenaming(false);
  }

  const canDelete = collections.length > 1;
  const isEmpty =
    collections.length <= 1 &&
    (collections[0]?.id == null || (tabsByCollection.get(collections[0].id)?.length ?? 0) === 0);

  const workspaceName = activeWorkspace?.name ?? "Workspace";

  return (
    <main className="flex h-full flex-col overflow-auto">
      {/* Sticky topbar */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/70 px-6 backdrop-blur-md">
        {/* Left: workspace name — click to rename */}
        {isRenaming ? (
          <Input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={confirmRename}
            className="h-8 w-48 text-lg font-semibold"
          />
        ) : (
          <p
            className="text-lg font-semibold truncate hover:bg-accent px-1 rounded cursor-pointer"
            onClick={startRename}
          >
            {workspaceName}
          </p>
        )}

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          {/* Zen mode */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleZenMode}
            title="Zen mode"
            aria-label="Toggle zen mode"
          >
            <Zap className={cn("size-4", isZenMode ? "text-primary" : "text-muted-foreground")} />
          </Button>

          {/* Search tabs */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => onSearchOpenChange(true)}
          >
            Search Tabs
            <kbd className="pointer-events-none ml-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘J
            </kbd>
          </Button>

          {/* Add collection */}
          <Button
            ref={addButtonRef}
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" />
            Add collection
          </Button>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="More actions">
                <EllipsisVertical className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={startRename}>
                <Pencil className="mr-2 size-4" />
                Rename Space
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={activeWorkspace?.isDefault}
                className={
                  activeWorkspace?.isDefault
                    ? "text-muted-foreground"
                    : "text-destructive focus:text-destructive"
                }
                onClick={() => {
                  if (!activeWorkspace?.isDefault) setDeleteWorkspaceOpen(true);
                }}
              >
                <Trash2 className="mr-2 size-4" />
                Delete Space
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {isEmpty ? (
          <AboutPage />
        ) : (
          <div className="space-y-2">
            {collections.map((col) => (
              <CollectionCard
                key={col.id}
                collection={col}
                tabs={tabsByCollection.get(col.id!) ?? []}
                canDelete={canDelete && col.name !== "Unsorted"}
                onRequestDelete={() => setDeleteTarget(col)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteCollectionDialog
        collectionId={deleteTarget?.id ?? null}
        collectionName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onAfterDelete={() => addButtonRef.current?.focus()}
      />
      <SearchDialog open={searchOpen} onOpenChange={onSearchOpenChange} />
      <DeleteWorkspaceDialog
        workspaceId={activeWorkspace?.id ?? null}
        workspaceName={activeWorkspace?.name ?? ""}
        open={deleteWorkspaceOpen}
        onOpenChange={setDeleteWorkspaceOpen}
        onAfterDelete={() => addButtonRef.current?.focus()}
      />
    </main>
  );
}
