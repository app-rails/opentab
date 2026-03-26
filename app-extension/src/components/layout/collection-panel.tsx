import { useAppStore } from "@/stores/app-store";

export function CollectionPanel() {
  const collections = useAppStore((s) => s.collections);

  return (
    <main className="flex h-full flex-col overflow-auto p-6">
      <h2 className="mb-4 text-lg font-semibold">Tab Collections</h2>
      {collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections yet.</p>
      ) : (
        <div className="space-y-4">
          {collections.map((col) => (
            <div key={col.id} className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-medium">{col.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Tabs will appear here in a future milestone.
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
