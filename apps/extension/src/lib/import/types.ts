// === Parsed import data (format-agnostic) ===

export type ImportSource = "tabtab" | "opentab";

export interface ImportData {
  source: ImportSource;
  workspaces: ImportWorkspace[];
}

export interface ImportWorkspace {
  name: string;
  icon?: string;
  collections: ImportCollection[];
}

export interface ImportCollection {
  name: string;
  tabs: ImportTab[];
}

export interface ImportTab {
  url: string;
  title: string;
  favIconUrl?: string;
  updatedAt?: number;
}

// === Diff result types ===

export interface DiffResult {
  workspaces: WorkspaceDiff[];
}

export type WorkspaceStatus = "new" | "same" | "conflict";
export type CollectionStatus = "new" | "same" | "conflict";
export type MergeStrategy = "merge" | "new" | "skip";
export type ExtraTabDecision = "keep" | "delete";

export interface WorkspaceDiff {
  name: string;
  icon?: string;
  status: WorkspaceStatus;
  existingWorkspaceId?: number;
  collections: CollectionDiff[];
}

export interface CollectionDiff {
  name: string;
  status: CollectionStatus;
  existingCollectionId?: number;
  toAdd: ImportTab[];
  extraExisting: ExistingTab[];
  metadataUpdates: MetadataUpdate[];
  unchangedCount: number;
  allTabs: ImportTab[];
}

export interface MetadataUpdate {
  existingTabId: number;
  title: string;
  favIconUrl?: string;
}

export interface ExistingTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  updatedAt?: number;
}

// === User decisions for import execution ===

export interface ImportPlan {
  workspaces: WorkspaceImportPlan[];
}

export interface WorkspaceImportPlan {
  name: string;
  icon?: string;
  selected: boolean;
  existingWorkspaceId?: number;
  collections: CollectionImportPlan[];
}

export interface CollectionImportPlan {
  name: string;
  selected: boolean;
  strategy: MergeStrategy;
  metadataUpdates: MetadataUpdate[];
  existingCollectionId?: number;
  toAdd: ImportTab[];
  extraExisting: ExistingTabDecision[];
  allTabs: ImportTab[];
}

export interface ExistingTabDecision extends ExistingTab {
  decision: ExtraTabDecision;
}
