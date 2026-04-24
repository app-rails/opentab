import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "drizzle-kit";

// alchemy dev's miniflare persists at <workspaceRoot>/.alchemy/miniflare/v3/.
// `workspaceRoot` is computed by Alchemy via `findWorkspaceRootSync`, which
// returns the pnpm-workspace.yaml directory. In this monorepo that is two
// levels above apps/cloud/. The hardcoded `../../` walk holds as long as
// the project stays at apps/cloud/ and pnpm-workspace.yaml stays at the
// repo root — both invariants of this monorepo.
const D1_DIR = resolve(__dirname, "../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject");

const getD1Url = (): string => {
  if (!existsSync(D1_DIR)) return "";

  const sqliteFile = readdirSync(D1_DIR).find((f) => f.endsWith(".sqlite"));
  return sqliteFile ? `${D1_DIR}/${sqliteFile}` : "";
};

export const d1Url = getD1Url();

export default {
  schema: "./drizzle/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: d1Url,
  },
} satisfies Config;
