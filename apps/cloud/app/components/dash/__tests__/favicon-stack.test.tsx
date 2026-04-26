import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaviconStack } from "~/components/dash/favicon-stack";

const URL_A = "https://a.example.com/favicon.ico";
const URL_B = "https://b.example.com/favicon.ico";
const URL_C = "https://c.example.com/favicon.ico";
const URL_D = "https://d.example.com/favicon.ico";
const URL_E = "https://e.example.com/favicon.ico";
const URL_F = "https://f.example.com/favicon.ico";

describe("FaviconStack", () => {
  it("renders one img per url and hides +N when totalTabs equals urls.length", () => {
    const { container } = render(<FaviconStack urls={[URL_A, URL_B, URL_C]} totalTabs={3} />);

    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
    expect(container.textContent).not.toContain("+");
  });

  it("clamps to 5 imgs and shows +N for the remaining tabs", () => {
    const { container } = render(
      <FaviconStack urls={[URL_A, URL_B, URL_C, URL_D, URL_E, URL_F]} totalTabs={20} />,
    );

    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(5);
    // remaining = totalTabs - urls.length = 20 - 6 = 14
    expect(container.textContent).toContain("+14");
  });

  it("renders nothing visible when urls is empty and totalTabs is 0", () => {
    const { container } = render(<FaviconStack urls={[]} totalTabs={0} />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).not.toContain("+");
  });

  it("falls back to a muted color block when an img errors", () => {
    const { container } = render(<FaviconStack urls={[URL_A, URL_B]} totalTabs={2} />);

    const firstImg = container.querySelectorAll("img")[0];
    if (!firstImg) throw new Error("expected first img to render");

    fireEvent.error(firstImg);

    // Failed index renders a div instead of an img.
    const imgsAfter = container.querySelectorAll("img");
    expect(imgsAfter).toHaveLength(1);
    expect(imgsAfter[0]).toHaveAttribute("src", URL_B);

    const fallback = container.querySelector("div.bg-muted");
    expect(fallback).toBeTruthy();
  });

  it("attaches lazy loading and no-referrer policy to imgs", () => {
    const { container } = render(<FaviconStack urls={[URL_A]} totalTabs={1} />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  });
});
