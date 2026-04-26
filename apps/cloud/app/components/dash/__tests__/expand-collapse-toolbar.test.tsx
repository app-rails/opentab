import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpandCollapseToolbar } from "~/components/dash/expand-collapse-toolbar";

describe("ExpandCollapseToolbar", () => {
  it("renders both 'Expand all' and 'Collapse all' buttons", () => {
    render(<ExpandCollapseToolbar onExpandAll={() => {}} onCollapseAll={() => {}} />);
    expect(screen.getByRole("button", { name: /Expand all/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /Collapse all/i })).toBeVisible();
  });

  it("invokes onExpandAll when 'Expand all' is clicked", () => {
    const onExpandAll = vi.fn();
    const onCollapseAll = vi.fn();
    render(<ExpandCollapseToolbar onExpandAll={onExpandAll} onCollapseAll={onCollapseAll} />);

    fireEvent.click(screen.getByRole("button", { name: /Expand all/i }));

    expect(onExpandAll).toHaveBeenCalledTimes(1);
    expect(onCollapseAll).not.toHaveBeenCalled();
  });

  it("invokes onCollapseAll when 'Collapse all' is clicked", () => {
    const onExpandAll = vi.fn();
    const onCollapseAll = vi.fn();
    render(<ExpandCollapseToolbar onExpandAll={onExpandAll} onCollapseAll={onCollapseAll} />);

    fireEvent.click(screen.getByRole("button", { name: /Collapse all/i }));

    expect(onCollapseAll).toHaveBeenCalledTimes(1);
    expect(onExpandAll).not.toHaveBeenCalled();
  });
});
