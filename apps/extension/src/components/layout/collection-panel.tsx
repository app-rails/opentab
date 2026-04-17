import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@opentab/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@opentab/ui/components/dropdown-menu";
import { Input } from "@opentab/ui/components/input";
import { cn } from "@opentab/ui/lib/utils";
import { EllipsisVertical, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CollectionCard } from "@/components/collection/collection-card";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { DeleteCollectionDialog } from "@/components/collection/delete-collection-dialog";
import { MoveCollectionDialog } from "@/components/collection/move-collection-dialog";
import { AboutPage } from "@/components/layout/about-page";
import { SearchDialog } from "@/components/layout/search-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import type { TabCollection } from "@/lib/db";
import type { ViewMode } from "@/lib/view-mode";
import { useAppStore } from "@/stores/app-store";

const VIEW_MODE_OPTIONS: {
  mode: ViewMode;
  labelKey:
    | "collection_panel.view_default"
    | "collection_panel.view_compact"
    | "collection_panel.view_list";
  btnClass: string;
  icon: ReactNode;
}[] = [
  {
    mode: "default",
    labelKey: "collection_panel.view_default",
    btnClass: "rounded-r-none",
    icon: (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    mode: "compact",
    labelKey: "collection_panel.view_compact",
    btnClass: "rounded-none border-x border-border",
    icon: (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="1" y="1" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="1" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1" y="7" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="9" y="7" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    mode: "list",
    labelKey: "collection_panel.view_list",
    btnClass: "rounded-l-none",
    icon: (
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line
          x1="1"
          y1="3"
          x2="15"
          y2="3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="1"
          y1="8"
          x2="15"
          y2="8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="1"
          y1="13"
          x2="15"
          y2="13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

interface CollectionPanelProps {
  isZenMode: boolean;
  onToggleZenMode: () => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  sidebarCollapsed?: boolean;
}

export function CollectionPanel({
  isZenMode,
  onToggleZenMode,
  searchOpen,
  onSearchOpenChange,
  sidebarCollapsed,
}: CollectionPanelProps) {
  const collections = useAppStore((s) => s.collections);
  const tabsByCollection = useAppStore((s) => s.tabsByCollection);
  const activeWorkspace = useAppStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null,
  );
  const workspaceCount = useAppStore((s) => s.workspaces.length);
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);
  const setWorkspaceViewMode = useAppStore((s) => s.setWorkspaceViewMode);
  const viewMode: ViewMode = activeWorkspace?.viewMode ?? "default";

  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TabCollection | null>(null);
  const [moveTarget, setMoveTarget] = useState<TabCollection | null>(null);
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

  const isEmpty = collections.length === 0;

  const workspaceName = activeWorkspace?.name ?? "Workspace";

  return (
    <main className="flex h-full flex-col overflow-auto">
      {/* Sticky topbar */}
      <div
        className={cn(
          "sticky top-0 z-10 flex h-14 items-center justify-between border-border border-b bg-background/70 px-6 backdrop-blur-md",
          sidebarCollapsed && "pl-10",
        )}
      >
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
            className="h-8 w-48 font-semibold text-lg"
          />
        ) : (
          <button
            type="button"
            className="cursor-pointer truncate rounded px-1 font-semibold text-lg hover:bg-accent"
            onClick={startRename}
          >
            {workspaceName}
          </button>
        )}

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          {/* Zen mode */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleZenMode}
            title={t("collection_panel.zen_mode")}
            aria-label={t("collection_panel.toggle_zen_mode")}
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
            {t("collection_panel.search_tabs")}
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
            onClick={(e) => {
              e.currentTarget.blur();
              setCreateOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            {t("collection_panel.add_collection")}
          </Button>

          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-border">
            {VIEW_MODE_OPTIONS.map(({ mode, labelKey, btnClass, icon }) => (
              <Button
                key={mode}
                variant="ghost"
                size="icon-xs"
                className={cn(btnClass, viewMode === mode && "bg-accent")}
                onClick={() =>
                  activeWorkspace?.id != null && setWorkspaceViewMode(activeWorkspace.id, mode)
                }
                title={t(labelKey)}
                aria-label={t(labelKey)}
              >
                {icon}
              </Button>
            ))}
          </div>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("collection_panel.more_actions")}
              >
                <EllipsisVertical className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={startRename}>
                <Pencil className="mr-2 size-4" />
                {t("collection_panel.rename_space")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={workspaceCount <= 1}
                className={
                  workspaceCount <= 1
                    ? "text-muted-foreground"
                    : "text-destructive focus:text-destructive"
                }
                onClick={() => {
                  if (workspaceCount > 1) {
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                    setDeleteWorkspaceOpen(true);
                  }
                }}
              >
                <Trash2 className="mr-2 size-4" />
                {t("collection_panel.delete_space")}
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
          <SortableContext
            items={collections.map((col) => `collection-${col.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {collections.map((col) => (
                <CollectionCard
                  key={col.id}
                  collection={col}
                  tabs={tabsByCollection.get(col.id!) ?? []}
                  viewMode={viewMode}
                  onRequestDelete={() => setDeleteTarget(col)}
                  onRequestMove={() => setMoveTarget(col)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MoveCollectionDialog
        collection={moveTarget}
        open={moveTarget != null}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
      />
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
