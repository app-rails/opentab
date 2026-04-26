import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceIcon } from "~/components/workspace-icon";

describe("WorkspaceIcon", () => {
  it("renders the matching lucide icon for a known kebab-case name", () => {
    const { container } = render(<WorkspaceIcon value="folder" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.classList.contains("lucide-folder")).toBe(true);
  });

  it("supports multi-word kebab-case names like shopping-cart", () => {
    const { container } = render(<WorkspaceIcon value="shopping-cart" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("lucide-shopping-cart")).toBe(true);
  });

  it("renders the raw string for emoji-like values (legacy data)", () => {
    const { container } = render(<WorkspaceIcon value="💼" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe("💼");
  });

  it("falls back to the default Folder icon for unknown kebab names", () => {
    const { container } = render(<WorkspaceIcon value="video" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("lucide-folder")).toBe(true);
    expect(container.textContent).toBe("");
  });

  it("falls back to the default Folder icon when value is null", () => {
    const { container } = render(<WorkspaceIcon value={null} />);
    expect(container.querySelector("svg")?.classList.contains("lucide-folder")).toBe(true);
  });

  it("falls back to the default Folder icon when value is empty string", () => {
    const { container } = render(<WorkspaceIcon value="" />);
    expect(container.querySelector("svg")?.classList.contains("lucide-folder")).toBe(true);
  });

  it("merges caller className onto the rendered icon", () => {
    const { container } = render(<WorkspaceIcon value="folder" className="size-7" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("size-7")).toBe(true);
  });
});
