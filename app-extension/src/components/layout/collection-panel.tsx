import { Plus } from "lucide-react";
import { useState } from "react";
import { CollectionCard } from "@/components/collection/collection-card";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { DeleteCollectionDialog } from "@/components/collection/delete-collection-dialog";
import { EmptyWorkspace } from "@/components/layout/empty-workspace";
import { WelcomeBanner } from "@/components/layout/welcome-banner";
import { Button } from "@/components/ui/button";
import type { TabCollection } from "@/lib/db";
import { useAppStore } from "@/stores/app-store";

export function CollectionPanel() {
  const collections = useAppStore((s) => s.collections);
  const tabsByCollection = useAppStore((s) => s.tabsByCollection);
  const workspaceName = useAppStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.name ?? "Workspace",
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TabCollection | null>(null);

  const canDelete = collections.length > 1;
  const isEmpty =
    collections.length <= 1 &&
    (collections[0]?.id == null || (tabsByCollection.get(collections[0].id)?.length ?? 0) === 0);

  return (
    <main className="flex h-full flex-col overflow-auto">
      {/* Sticky topbar */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/70 px-6 backdrop-blur-md">
        <h2 className="text-lg font-semibold truncate">{workspaceName}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setCreateOpen(true)}
            title="Add collection"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 p-6">
        {isEmpty && <WelcomeBanner />}

        {isEmpty ? (
          <EmptyWorkspace />
        ) : (
          <div className="mt-2 space-y-4">
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
      />
    </main>
  );
}
