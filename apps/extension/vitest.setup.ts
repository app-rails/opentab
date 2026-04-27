import "@testing-library/jest-dom/vitest";

// jsdom doesn't ship ResizeObserver or Element#scrollIntoView; cmdk (used by
// shadcn Command/Combobox) calls both during item registration and selection.
// Stub them as no-ops so popover-based Combobox tests can mount and interact.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
