import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsHero } from "~/components/dash/stats-hero";

describe("StatsHero", () => {
  it("renders three stat cards with the supplied numbers", () => {
    render(<StatsHero workspaces={3} collections={12} tabs={87} />);

    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
    expect(screen.getByText("87")).toBeVisible();
  });

  it("uses plural labels when counts are not 1", () => {
    render(<StatsHero workspaces={3} collections={12} tabs={87} />);

    expect(screen.getByText("Workspaces")).toBeVisible();
    expect(screen.getByText("Collections")).toBeVisible();
    expect(screen.getByText("Tabs")).toBeVisible();
  });

  it("singularizes only the labels whose count is 1", () => {
    render(<StatsHero workspaces={1} collections={1} tabs={1} />);

    expect(screen.getByText("Workspace")).toBeVisible();
    expect(screen.getByText("Collection")).toBeVisible();
    expect(screen.getByText("Tab")).toBeVisible();
  });

  it("keeps plural labels for zero counts", () => {
    render(<StatsHero workspaces={0} collections={0} tabs={0} />);

    expect(screen.getByText("Workspaces")).toBeVisible();
    expect(screen.getByText("Collections")).toBeVisible();
    expect(screen.getByText("Tabs")).toBeVisible();
  });
});
