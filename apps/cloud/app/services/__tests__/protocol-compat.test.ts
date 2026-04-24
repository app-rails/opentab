import { describe, expect, it } from "vitest";
import { compareDotted } from "../protocol-compat.server";

describe("compareDotted", () => {
  it("returns 0 for equal versions", () => {
    expect(compareDotted("1.0.0", "1.0.0")).toBe(0);
    expect(compareDotted("2.5.7", "2.5.7")).toBe(0);
  });

  it("returns -1 when a is less than b", () => {
    expect(compareDotted("1.0.0", "2.0.0")).toBe(-1);
    expect(compareDotted("1.2.3", "1.2.4")).toBe(-1);
    expect(compareDotted("1.0.9", "1.1.0")).toBe(-1);
  });

  it("returns 1 when a is greater than b", () => {
    expect(compareDotted("2.0.0", "1.9.9")).toBe(1);
    expect(compareDotted("1.2.4", "1.2.3")).toBe(1);
    expect(compareDotted("1.10.0", "1.9.0")).toBe(1);
  });

  it("compares numerically, not lexically", () => {
    // "10" > "2" numerically, but "10" < "2" lexically
    expect(compareDotted("1.10.0", "1.2.0")).toBe(1);
    expect(compareDotted("1.2.0", "1.10.0")).toBe(-1);
  });

  it("zero-pads shorter versions on the right", () => {
    expect(compareDotted("1.2", "1.2.0")).toBe(0);
    expect(compareDotted("1", "1.0.0")).toBe(0);
    expect(compareDotted("1.2", "1.2.1")).toBe(-1);
  });

  it("treats non-numeric segments as 0", () => {
    // parseInt returns NaN on garbage; the `|| 0` fallback normalizes it.
    expect(compareDotted("1.x.0", "1.0.0")).toBe(0);
  });
});
