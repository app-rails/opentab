import type { ImportCollection, ImportData, ImportTab, ImportWorkspace } from "./types";

interface TabTabBackup {
  space_list: { id: string; name: string; icon?: string }[];
  spaces: Record<
    string,
    {
      id: string;
      name: string;
      groups: {
        id: string;
        name: string;
        tabs: { id: string; title: string; url: string; favIconUrl?: string; kind: string }[];
      }[];
    }
  >;
}

export function parseTabTab(json: unknown): ImportData {
  const data = json as TabTabBackup;

  const workspaces: ImportWorkspace[] = data.space_list.map((space) => {
    const spaceData = data.spaces[space.id];
    const collections: ImportCollection[] = (spaceData?.groups ?? []).map((group) => ({
      name: group.name,
      tabs: group.tabs
        .filter((tab) => tab.kind === "record")
        .map<ImportTab>((tab) => ({
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
        })),
    }));

    return {
      name: space.name,
      icon: space.icon,
      collections,
    };
  });

  return { source: "tabtab", workspaces };
}
