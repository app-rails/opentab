import { Search } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { TabFavicon } from "@/components/tab-favicon";
import type { CollectionTab } from "@/lib/db";
import { db } from "@/lib/db";

interface SearchResult extends CollectionTab {
  workspaceName?: string;
  collectionName?: string;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { t } = useTranslation();
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
    // Use Dexie .filter() with .limit() to avoid loading entire table into JS
    const matched = await db.collectionTabs
      .filter((t) => t.title.toLowerCase().includes(lower) || t.url.toLowerCase().includes(lower))
      .limit(50)
      .toArray();

    if (matched.length === 0) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    // Enrich with collection and workspace names
    const collectionIds = [...new Set(matched.map((t) => t.collectionId))];
    const collections = await db.tabCollections.where("id").anyOf(collectionIds).toArray();
    const collectionMap = new Map(collections.map((c) => [c.id, c]));

    const workspaceIds = [...new Set(collections.map((c) => c.workspaceId))];
    const workspaces =
      workspaceIds.length > 0 ? await db.workspaces.where("id").anyOf(workspaceIds).toArray() : [];
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

    setResults(enriched);
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

  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap: keep Tab cycling within the dialog
  function handleDialogKeyDown(e: ReactKeyboardEvent) {
    if (e.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-label={t("search.close")}
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("search.label")}
        onKeyDown={handleDialogKeyDown}
        className="fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border bg-popover shadow-lg"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("search.placeholder")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-auto p-2">
          {query.trim() && results.length === 0 && (
            <p className="py-6 text-center text-muted-foreground text-sm">
              {t("search.no_results")}
            </p>
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
              <div className="min-w-0 flex-1">
                <p className="truncate">{result.title || result.url}</p>
                <p className="truncate text-muted-foreground text-xs">
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
