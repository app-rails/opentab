import { formatRelativeFromNow } from "./datetime";

export interface DashboardGreetingInput {
  name?: string;
  workspaceCount: number;
  lastSyncedAt?: number;
}

export interface DashboardGreeting {
  title: string;
  subtitle: string;
}

/**
 * Build the dashboard hero copy. Pure: no React, no router, no Date instances
 * created beyond what `formatRelativeFromNow` already does.
 *
 * Subtitle rules:
 *   - workspaceCount === 0  → "No workspaces synced yet" (lastSyncedAt ignored)
 *   - lastSyncedAt missing  → "<n> workspace[s]"
 *   - otherwise             → "<n> workspace[s] · synced <relative>"
 */
export function dashboardGreeting(input: DashboardGreetingInput): DashboardGreeting {
  const { name, workspaceCount, lastSyncedAt } = input;

  const trimmedName = name?.trim();
  const title = trimmedName ? `Welcome back, ${trimmedName}` : "Welcome back";

  if (workspaceCount === 0) {
    return { title, subtitle: "No workspaces synced yet" };
  }

  const wsLabel = `${workspaceCount} ${workspaceCount === 1 ? "workspace" : "workspaces"}`;
  const subtitle =
    lastSyncedAt !== undefined
      ? `${wsLabel} · synced ${formatRelativeFromNow(lastSyncedAt)}`
      : wsLabel;

  return { title, subtitle };
}
