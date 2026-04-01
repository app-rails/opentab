import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TabFavicon } from "@/components/tab-favicon";
import { db } from "@/lib/db";
import type { CollectionTab } from "@/lib/db";

interface SearchResult extends CollectionTab {
  workspaceName?: string;
  collectionName?: string;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    const lower = q.toLowerCase();
    const allTabs = await db.collectionTabs.toArray();
    const matched = allTabs.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        t.url.toLowerCase().includes(lower),
    );

    // Enrich with collection and workspace names
    const collectionIds = [...new Set(matched.map((t) => t.collectionId))];
    const collections = await db.tabCollections.where("id").anyOf(collectionIds).toArray();
    const collectionMap = new Map(collections.map((c) => [c.id, c]));

    const workspaceIds = [...new Set(collections.map((c) => c.workspaceId))];
    const workspaces = await db.workspaces.where("id").anyOf(workspaceIds).toArray();
    const workspaceMap = new Map(workspaces.map((w) => [w.id, w]));

    const enriched: SearchResult[] = matched.map((tab) => {
      const col = collectionMap.get(tab.collectionId);
      const ws = col ? workspaceMap.get(col.workspaceId) : undefined;
      return {
        ...tab,
        collectionName: col?.name,
        workspaceName: ws?.name,
      };
    });

    // Sort: title matches first, then URL matches
    enriched.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(lower) ? 0 : 1;
      const bTitle = b.title.toLowerCase().includes(lower) ? 0 : 1;
      return aTitle - bTitle;
    });

    setResults(enriched.slice(0, 50));
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 150);
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      chrome.tabs.create({ url: results[selectedIndex].url, active: true });
      onOpenChange(false);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog */}
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border bg-popover shadow-lg">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search saved tabs..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-auto p-2">
          {query.trim() && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No results found</p>
          )}
          {results.map((result, i) => (
            <button
              key={`${result.id}-${result.collectionId}`}
              type="button"
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              }`}
              onClick={() => {
                chrome.tabs.create({ url: result.url, active: true });
                onOpenChange(false);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <TabFavicon url={result.favIconUrl} size="md" />
              <div className="flex-1 min-w-0">
                <p className="truncate">{result.title || result.url}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {result.collectionName}
                  {result.workspaceName && ` · ${result.workspaceName}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
