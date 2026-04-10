import { Button } from "@opentab/ui/components/button";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toaster, toast } from "sonner";
import { ImportDetail } from "@/components/import/import-detail";
import { ImportSummaryBar } from "@/components/import/import-summary-bar";
import { ImportTree } from "@/components/import/import-tree";
import { db } from "@/lib/db";
import { computeDiff } from "@/lib/import/diff";
import { executeImport } from "@/lib/import/execute";
import type {
  CollectionImportPlan,
  DiffResult,
  ExistingTabDecision,
  ExtraTabDecision,
  ImportData,
  ImportPlan,
  MergeStrategy,
  WorkspaceImportPlan,
} from "@/lib/import/types";

type PageState = "loading" | "error" | "preview" | "importing" | "done";

/** Immutably update a single collection inside a plan */
function updateCollection(
  plan: ImportPlan,
  wsIndex: number,
  colIndex: number,
  updater: (col: CollectionImportPlan) => CollectionImportPlan,
): ImportPlan {
  return {
    ...plan,
    workspaces: plan.workspaces.map((w, wi) =>
      wi === wsIndex
        ? { ...w, collections: w.collections.map((c, ci) => (ci === colIndex ? updater(c) : c)) }
        : w,
    ),
  };
}

function buildInitialPlan(diff: DiffResult): ImportPlan {
  return {
    workspaces: diff.workspaces.map<WorkspaceImportPlan>((ws) => ({
      name: ws.name,
      icon: ws.icon,
      selected: ws.status !== "same",
      existingWorkspaceId: ws.existingWorkspaceId,
      collections: ws.collections.map<CollectionImportPlan>((col) => ({
        name: col.name,
        selected: col.status !== "same",
        strategy: col.status === "conflict" ? "merge" : col.status === "new" ? "new" : "skip",
        existingCollectionId: col.existingCollectionId,
        toAdd: col.toAdd,
        extraExisting: col.extraExisting.map<ExistingTabDecision>((tab) => ({
          ...tab,
          decision: "keep" as ExtraTabDecision,
        })),
        metadataUpdates: col.metadataUpdates,
        allTabs: col.allTabs,
      })),
    })),
  };
}

export default function App() {
  const { t } = useTranslation();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<{
    wsIndex: number;
    colIndex: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const sessionId = Number(params.get("sessionId"));
        if (!sessionId) {
          setErrorMessage(t("import_page.no_session"));
          setPageState("error");
          return;
        }

        const session = await db.importSessions.get(sessionId);
        if (!session) {
          setErrorMessage(t("import_page.expired"));
          setPageState("error");
          return;
        }

        await db.importSessions.delete(sessionId);
        // Fire-and-forget: clean stale sessions without blocking import load
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        db.importSessions.where("createdAt").below(oneHourAgo).delete();

        const importData: ImportData = JSON.parse(session.data);
        const diffResult = await computeDiff(importData);

        setDiff(diffResult);
        setPlan(buildInitialPlan(diffResult));
        setPageState("preview");

        for (let wi = 0; wi < diffResult.workspaces.length; wi++) {
          for (let ci = 0; ci < diffResult.workspaces[wi].collections.length; ci++) {
            if (diffResult.workspaces[wi].collections[ci].status !== "same") {
              setSelectedCollection({ wsIndex: wi, colIndex: ci });
              return;
            }
          }
        }
      } catch (err) {
        console.error("Failed to load import session:", err);
        setErrorMessage(t("import_page.load_error"));
        setPageState("error");
      }
    })();
  }, [t]);

  const handleToggleWorkspace = useCallback((wsIndex: number) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const ws = prev.workspaces[wsIndex];
      const newSelected = !ws.selected;
      return {
        ...prev,
        workspaces: prev.workspaces.map((w, i) =>
          i === wsIndex
            ? {
                ...w,
                selected: newSelected,
                collections: w.collections.map((c) => ({
                  ...c,
                  selected: newSelected && c.strategy !== "skip",
                })),
              }
            : w,
        ),
      };
    });
  }, []);

  const handleToggleCollection = useCallback((wsIndex: number, colIndex: number) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const updated = updateCollection(prev, wsIndex, colIndex, (c) => ({
        ...c,
        selected: !c.selected,
      }));
      // Also ensure parent workspace is selected
      return {
        ...updated,
        workspaces: updated.workspaces.map((w, wi) =>
          wi === wsIndex ? { ...w, selected: true } : w,
        ),
      };
    });
  }, []);

  const handleStrategyChange = useCallback(
    (wsIndex: number, colIndex: number, strategy: MergeStrategy) => {
      setPlan((prev) =>
        prev ? updateCollection(prev, wsIndex, colIndex, (c) => ({ ...c, strategy })) : prev,
      );
    },
    [],
  );

  const handleExtraTabDecision = useCallback(
    (wsIndex: number, colIndex: number, tabId: number, decision: ExtraTabDecision) => {
      setPlan((prev) =>
        prev
          ? updateCollection(prev, wsIndex, colIndex, (c) => ({
              ...c,
              extraExisting: c.extraExisting.map((t) => (t.id === tabId ? { ...t, decision } : t)),
            }))
          : prev,
      );
    },
    [],
  );

  const handleBatchExtraDecision = useCallback(
    (wsIndex: number, colIndex: number, decision: ExtraTabDecision) => {
      setPlan((prev) =>
        prev
          ? updateCollection(prev, wsIndex, colIndex, (c) => ({
              ...c,
              extraExisting: c.extraExisting.map((t) => ({ ...t, decision })),
            }))
          : prev,
      );
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!plan) return;
    setPageState("importing");
    try {
      const result = await executeImport(plan);
      setPageState("done");
      toast.success(
        t("import_page.toast_success", {
          workspaces: result.workspaceCount,
          collections: result.collectionCount,
          tabs: result.tabCount,
        }),
      );
      setTimeout(() => window.close(), 2000);
    } catch (err) {
      console.error("Import failed:", err);
      toast.error(t("import_page.toast_error"));
      setPageState("preview");
    }
  }, [plan, t]);

  if (pageState === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("import_page.loading")}</p>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-destructive">{errorMessage}</p>
      </div>
    );
  }

  if (pageState === "done") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Toaster />
        <p className="text-muted-foreground">{t("import_page.complete")}</p>
      </div>
    );
  }

  if (!diff || !plan) return null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Toaster />

      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">{t("import_page.title")}</h1>
        <Button variant="ghost" size="sm" onClick={() => window.close()}>
          {t("import_page.cancel")}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 overflow-y-auto border-r border-border p-3">
          <ImportTree
            diff={diff}
            plan={plan}
            selectedCollection={selectedCollection}
            onToggleWorkspace={handleToggleWorkspace}
            onToggleCollection={handleToggleCollection}
            onSelectCollection={setSelectedCollection}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {selectedCollection ? (
            <ImportDetail
              wsDiff={diff.workspaces[selectedCollection.wsIndex]}
              colDiff={
                diff.workspaces[selectedCollection.wsIndex].collections[selectedCollection.colIndex]
              }
              colPlan={
                plan.workspaces[selectedCollection.wsIndex].collections[selectedCollection.colIndex]
              }
              wsIndex={selectedCollection.wsIndex}
              colIndex={selectedCollection.colIndex}
              onStrategyChange={handleStrategyChange}
              onExtraTabDecision={handleExtraTabDecision}
              onBatchExtraDecision={handleBatchExtraDecision}
            />
          ) : (
            <p className="text-muted-foreground">{t("import_page.select_collection")}</p>
          )}
        </div>
      </div>

      <ImportSummaryBar
        plan={plan}
        isImporting={pageState === "importing"}
        onImport={handleImport}
      />
    </div>
  );
}
