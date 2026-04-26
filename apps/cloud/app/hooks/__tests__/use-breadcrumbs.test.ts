import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBreadcrumbs } from "~/hooks/use-breadcrumbs";

const useMatchesMock = vi.fn();

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useMatches: () => useMatchesMock(),
  };
});

describe("useBreadcrumbs", () => {
  it("returns an empty list when no matches expose a handle", () => {
    useMatchesMock.mockReturnValue([
      { id: "root", pathname: "/", data: undefined, handle: undefined, params: {} },
    ]);
    const { result } = renderHook(() => useBreadcrumbs());
    expect(result.current).toEqual([]);
  });

  it("collects single-entry handles from each match in order", () => {
    useMatchesMock.mockReturnValue([
      {
        id: "layout",
        pathname: "/dash",
        data: undefined,
        handle: { breadcrumb: () => ({ label: "Dashboard", href: "/dash" }) },
        params: {},
      },
      {
        id: "leaf",
        pathname: "/dash/workspace",
        data: undefined,
        handle: { breadcrumb: () => ({ label: "Workspaces", href: "/dash/workspace" }) },
        params: {},
      },
    ]);
    const { result } = renderHook(() => useBreadcrumbs());
    expect(result.current).toEqual([
      { label: "Dashboard", href: "/dash" },
      { label: "Workspaces", href: "/dash/workspace" },
    ]);
  });

  it("flattens array-returning handles into the chain", () => {
    useMatchesMock.mockReturnValue([
      {
        id: "layout",
        pathname: "/dash",
        data: undefined,
        handle: { breadcrumb: () => ({ label: "Dashboard", href: "/dash" }) },
        params: {},
      },
      {
        id: "leaf",
        pathname: "/dash/workspace/abc/edit",
        data: { workspace: { name: "Work", syncId: "abc" } },
        handle: {
          breadcrumb: (data: unknown) => {
            const d = data as { workspace: { name: string; syncId: string } };
            return [
              { label: "Workspaces", href: "/dash/workspace" },
              { label: d.workspace.name, href: `/dash/workspace/${d.workspace.syncId}` },
              { label: "Rename" },
            ];
          },
        },
        params: {},
      },
    ]);
    const { result } = renderHook(() => useBreadcrumbs());
    expect(result.current).toEqual([
      { label: "Dashboard", href: "/dash" },
      { label: "Workspaces", href: "/dash/workspace" },
      { label: "Work", href: "/dash/workspace/abc" },
      { label: "Rename" },
    ]);
  });

  it("skips matches whose handle exists but has no breadcrumb", () => {
    useMatchesMock.mockReturnValue([
      { id: "a", pathname: "/", data: undefined, handle: { other: 1 }, params: {} },
      {
        id: "b",
        pathname: "/x",
        data: undefined,
        handle: { breadcrumb: () => ({ label: "B" }) },
        params: {},
      },
    ]);
    const { result } = renderHook(() => useBreadcrumbs());
    expect(result.current).toEqual([{ label: "B" }]);
  });
});
