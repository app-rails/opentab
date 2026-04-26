export type BreadcrumbEntry = { label: string; href?: string };

/**
 * Convention for `route.handle` exports across the dash subtree. Each route
 * may export `handle = { breadcrumb }` returning either a single entry or
 * an array; useBreadcrumbs walks useMatches() and concatenates the result.
 *
 * Kept in `lib/` (not co-located with the hook) so route files can import
 * the type without dragging react-router into server-side bundles.
 */
export type BreadcrumbHandle = {
  breadcrumb?: (loaderData: unknown) => BreadcrumbEntry | BreadcrumbEntry[];
};

/**
 * Loader-side payload that breadcrumb-aware deep routes attach to their
 * loader return. Lives in this client-safe module so route files can
 * import the type without pulling the server loader helper.
 */
export type BreadcrumbContext = {
  workspaceName: string;
  collectionName?: string;
};
