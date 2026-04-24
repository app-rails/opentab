import { describe, expect, it } from "vitest";
import { compareDotted } from "@/lib/sync-setup/semver";

describe("compareDotted", () => {
  it("returns 0 for equal versions", () => {
    expect(compareDotted("1.2.3", "1.2.3")).toBe(0);
    expect(compareDotted("0.0.1", "0.0.1")).toBe(0);
  });

  it("returns -1 when a is less than b", () => {
    expect(compareDotted("1.2.3", "1.2.4")).toBe(-1);
    expect(compareDotted("1.2.3", "1.3.0")).toBe(-1);
    expect(compareDotted("1.2.3", "2.0.0")).toBe(-1);
  });

  it("returns 1 when a is greater than b", () => {
    expect(compareDotted("1.2.4", "1.2.3")).toBe(1);
    expect(compareDotted("2.0.0", "1.99.99")).toBe(1);
  });

  it("pads missing segments with 0", () => {
    expect(compareDotted("1.2", "1.2.0")).toBe(0);
    expect(compareDotted("1", "1.0.0")).toBe(0);
    expect(compareDotted("1.2", "1.2.1")).toBe(-1);
  });

  it("treats non-numeric segments as 0", () => {
    expect(compareDotted("1.x.3", "1.0.3")).toBe(0);
    expect(compareDotted("1.2.3", "1.x.3")).toBe(1);
  });
});
