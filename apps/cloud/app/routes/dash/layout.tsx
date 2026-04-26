import { and, eq, isNull } from "drizzle-orm";
import { data, Outlet } from "react-router";
import { DashHeader } from "~/components/dash/layout/header";
import { AuthenticatedShell } from "~/components/shell/authenticated-shell";
import { workspaces } from "~/drizzle/schema";
import type { BreadcrumbHandle } from "~/lib/breadcrumbs";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/layout";

export const handle: BreadcrumbHandle = {
  breadcrumb: () => ({ label: "Dashboard", href: "/dash" }),
};

export type DashLayoutWorkspaceView = {
  syncId: string;
  name: string;
  icon: string | null;
  order: string;
  updatedAt: number;
};

export type DashLayoutLoaderData = {
  workspaces: DashLayoutWorkspaceView[];
};

/**
 * Lightweight loader for the `/dash` subtree. Powers the dashboard index's
 * "Recently updated" list, so we run it once at the layout level and let
 * descendants read via `useRouteLoaderData("routes/dash/layout")`.
 */
export async function loadDashLayout(
  dbInstance: Db,
  userId: string,
): Promise<DashLayoutLoaderData> {
  const rows = await dbInstance
    .select({
      syncId: workspaces.syncId,
      name: workspaces.name,
      icon: workspaces.icon,
      order: workspaces.order,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), isNull(workspaces.deletedAt)));

  const sorted = [...rows].sort((a, b) => {
    if (a.order < b.order) return -1;
    if (a.order > b.order) return 1;
    return 0;
  });

  return {
    workspaces: sorted.map((w) => ({
      syncId: w.syncId,
      name: w.name,
      icon: w.icon ?? null,
      order: w.order,
      updatedAt: w.updatedAt.getTime(),
    })),
  };
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadDashLayout(db as unknown as Db, user.id);
  return data(result);
}

export default function DashLayout(_: Route.ComponentProps) {
  return (
    <AuthenticatedShell>
      <DashHeader />
      <div className="flex w-full max-w-[1680px] flex-1 flex-col space-y-6 px-6 py-6">
        <Outlet />
      </div>
    </AuthenticatedShell>
  );
}
