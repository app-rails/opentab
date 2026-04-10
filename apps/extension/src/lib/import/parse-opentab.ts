import type { ImportCollection, ImportData, ImportTab, ImportWorkspace } from "./types";

interface OpenTabBackup {
  version: number;
  exportedAt: string;
  workspaces: {
    name: string;
    icon: string;
    viewMode?: string;
    collections: {
      name: string;
      tabs: {
        url: string;
        title: string;
        favIconUrl?: string;
        updatedAt?: number;
      }[];
    }[];
  }[];
}

export function parseOpenTab(json: unknown): ImportData {
  const data = json as OpenTabBackup;

  const workspaces: ImportWorkspace[] = data.workspaces.map((ws) => ({
    name: ws.name,
    icon: ws.icon,
    collections: ws.collections.map<ImportCollection>((col) => ({
      name: col.name,
      tabs: col.tabs.map<ImportTab>((tab) => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        updatedAt: tab.updatedAt,
      })),
    })),
  }));

  return { source: "opentab", workspaces };
}
