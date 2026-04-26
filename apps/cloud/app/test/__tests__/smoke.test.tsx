import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("dom smoke", () => {
  it("renders a div via testing-library", () => {
    render(<div>hello</div>);
    expect(screen.getByText("hello")).toBeVisible();
  });
});
