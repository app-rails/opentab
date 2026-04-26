import { useMatches } from "react-router";
import type { BreadcrumbEntry, BreadcrumbHandle } from "~/lib/breadcrumbs";

/**
 * Walks the active route match chain and concatenates each route's
 * `handle.breadcrumb(loaderData)` output into a single ordered list.
 * Routes without a handle are skipped; deep routes can return an array
 * to inject several entries at once (workspace + collection + action).
 */
export function useBreadcrumbs(): BreadcrumbEntry[] {
  const matches = useMatches();
  const crumbs: BreadcrumbEntry[] = [];
  for (const match of matches) {
    const handle = match.handle as BreadcrumbHandle | undefined;
    if (!handle?.breadcrumb) continue;
    const result = handle.breadcrumb(match.data);
    if (Array.isArray(result)) {
      crumbs.push(...result);
    } else {
      crumbs.push(result);
    }
  }
  return crumbs;
}
