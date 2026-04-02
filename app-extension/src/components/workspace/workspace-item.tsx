import { Ellipsis, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
import type { Workspace } from "@/lib/db";
import { cn } from "@/lib/utils";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";
import { useAppStore } from "@/stores/app-store";
import { IconPicker } from "./icon-picker";

interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  isLastWorkspace: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}

export function WorkspaceItem({
  workspace,
  isActive,
  isLastWorkspace,
  onSelect,
  onRequestDelete,
}: WorkspaceItemProps) {
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);
  const changeWorkspaceIcon = useAppStore((s) => s.changeWorkspaceIcon);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.name);
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isConfirmingRef = useRef(false);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  function startRename() {
    setRenameValue(workspace.name);
    setIsRenaming(true);
  }

  function confirmRename() {
    if (isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    const trimmed = renameValue.trim();
    if (trimmed.length > 0 && trimmed !== workspace.name && workspace.id != null) {
      renameWorkspace(workspace.id, trimmed);
    }
    setIsRenaming(false);
    isConfirmingRef.current = false;
  }

  function cancelRename() {
    setRenameValue(workspace.name);
    setIsRenaming(false);
  }

  const LucideIcon = WORKSPACE_ICONS[workspace.icon] ?? WORKSPACE_ICONS.folder;

  function openIconPicker() {
    setIconPopoverOpen(true);
  }

  function renderMenuItems(
    MenuItem: typeof DropdownMenuItem,
    MenuSeparator: typeof DropdownMenuSeparator,
  ) {
    return (
      <>
        <MenuItem onClick={startRename}>
          <Pencil className="mr-2 size-4" />
          Change Name
        </MenuItem>
        <MenuItem onClick={openIconPicker}>
          <ImagePlus className="mr-2 size-4" />
          Change Icon
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onClick={onRequestDelete}
          disabled={isLastWorkspace}
          className={cn(
            isLastWorkspace ? "text-muted-foreground" : "text-destructive focus:text-destructive",
          )}
        >
          <Trash2 className="mr-2 size-4" />
          Delete
          {isLastWorkspace && (
            <span className="ml-auto text-xs italic text-muted-foreground">last</span>
          )}
        </MenuItem>
      </>
    );
  }

  return (
    <Popover open={iconPopoverOpen} onOpenChange={setIconPopoverOpen}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <button
              type="button"
              className={cn(
                "group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-accent-foreground/10"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
              onClick={onSelect}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
            >
              <LucideIcon className="size-4 shrink-0" />

              {isRenaming ? (
                <Input
                  ref={inputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={WORKSPACE_NAME_MAX_LENGTH}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={confirmRename}
                  className="h-6 flex-1 px-1 py-0 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate" title="Double-click to rename">
                  {workspace.name}
                </span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Ellipsis className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom">
                  {renderMenuItems(DropdownMenuItem, DropdownMenuSeparator)}
                </DropdownMenuContent>
              </DropdownMenu>
            </button>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {renderMenuItems(ContextMenuItem, ContextMenuSeparator)}
        </ContextMenuContent>
      </ContextMenu>
      <PopoverContent className="w-auto p-3" side="right" align="start">
        <IconPicker
          value={workspace.icon}
          onChange={(icon) => {
            if (workspace.id != null) changeWorkspaceIcon(workspace.id, icon);
            setIconPopoverOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
