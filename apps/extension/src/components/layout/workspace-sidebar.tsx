import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@opentab/ui/components/button";
import { cn } from "@opentab/ui/lib/utils";
import { ChevronLeft, Monitor, Moon, PanelLeft, Plus, Settings, Sun } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import opentabLogo from "@/assets/opentab-logo.webp";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { useLocale } from "@/lib/locale";
import { useTheme } from "@/lib/theme";
import { useAppStore } from "@/stores/app-store";

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

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

  const { mode, cycleTheme } = useTheme();
  const { locale, cycleLocale } = useLocale();
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const ThemeIcon = THEME_ICON[mode];

  return (
    <div className={cn("relative shrink-0", collapsed ? "w-3" : "")}>
      {/* Expand toggle — always visible outside overflow-hidden */}
      {collapsed && (
        <button
          type="button"
          className="absolute top-3 -right-3 z-10 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
          onClick={onToggleCollapse}
          aria-label={t("sidebar.expand_sidebar")}
        >
          <ChevronLeft className="size-3.5 rotate-180" />
        </button>
      )}

      <aside
        className={cn(
          "flex h-full flex-col overflow-hidden border-border border-r bg-sidebar transition-[width] duration-200 ease-linear",
          collapsed ? "w-0 border-r-0" : "w-64",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <img src={opentabLogo} alt="" className="size-6 rounded" />
            <h1 className="font-semibold text-lg text-sidebar-foreground">OpenTab</h1>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleCollapse}
            aria-label={t("sidebar.toggle_sidebar")}
          >
            <PanelLeft className="size-4" />
          </Button>
        </div>

        {/* Separator */}
        <div className="mx-2 h-[1px] bg-sidebar-border" />

        {/* Spaces header */}
        <div className="relative mt-3 mb-1 flex items-center px-4">
          <h2 className="font-medium text-sidebar-foreground/70 text-xs uppercase tracking-wide">
            {t("sidebar.spaces")}
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-2"
            onClick={(e) => {
              e.currentTarget.blur();
              setCreateOpen(true);
            }}
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
        <div className="flex items-center gap-0.5 px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start gap-2 text-sidebar-foreground/70 text-sm"
            onClick={() => {
              chrome.tabs.create({ url: chrome.runtime.getURL("/settings.html") });
            }}
          >
            <Settings className="size-4" />
            {t("sidebar.settings")}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={cycleTheme}
            aria-label={t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) })}
            title={t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) })}
          >
            <ThemeIcon className="size-4 text-sidebar-foreground/70" />
          </Button>
          {(() => {
            const langLabel =
              locale === "en" ? t("sidebar.language_label_en") : t("sidebar.language_label_zh");
            const langAbbr = locale === "en" ? t("sidebar.language_en") : t("sidebar.language_zh");
            return (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={cycleLocale}
                aria-label={langLabel}
                title={langLabel}
              >
                <span className="font-medium text-sidebar-foreground/70 text-xs">{langAbbr}</span>
              </Button>
            );
          })()}
        </div>
      </aside>
    </div>
  );
}
