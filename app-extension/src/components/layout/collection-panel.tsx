import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TabCollection } from "@/lib/db";
import { useAppStore } from "@/stores/app-store";
import { CollectionCard } from "@/components/collection/collection-card";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { DeleteCollectionDialog } from "@/components/collection/delete-collection-dialog";

export function CollectionPanel() {
  const collections = useAppStore((s) => s.collections);
  const tabsByCollection = useAppStore((s) => s.tabsByCollection);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TabCollection | null>(null);

  const canDelete = collections.length > 1;

  return (
    <main className="flex h-full flex-col overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tab Collections</h2>
        <Button variant="ghost" size="icon-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
        </Button>
      </div>

      {collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections yet.</p>
      ) : (
        <div className="space-y-4">
          {collections.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              tabs={tabsByCollection.get(col.id!) ?? []}
              canDelete={canDelete}
              onRequestDelete={() => setDeleteTarget(col)}
            />
          ))}
        </div>
      )}

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
