import { type RenderOptions, type RenderResult, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";

type RootLoaderData = Record<string, unknown>;

interface RenderWithRouterOptions extends RenderOptions {
  initialEntries?: string[];
  /**
   * Loader data exposed under route id `root`. Use when the rendered tree
   * calls `useRoute("root")` (e.g. via `useRequestInfo`).
   */
  rootLoaderData?: RootLoaderData;
}

/**
 * Renders a component inside a data-router context so hooks like
 * `useFetcher`, `useLoaderData`, and `useRoute("root")` work.
 *
 * When `rootLoaderData` is provided, the tree is wrapped in a parent
 * route whose `id` is "root" and whose loader returns that data.
 */
export function renderWithRouter(ui: ReactElement, opts?: RenderWithRouterOptions): RenderResult {
  const { initialEntries = ["/"], rootLoaderData, ...rest } = opts ?? {};

  // Single splat-rooted route so tests can drive `initialEntries` to any
  // URL (including `/` and e.g. `/dash` for asserting NavLink active
  // state) without tripping React Router's "no route matches URL" error.
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "*",
        loader: rootLoaderData ? () => rootLoaderData : undefined,
        element: ui,
      },
    ],
    { initialEntries },
  );

  return render(<RouterProvider router={router} />, rest);
}
