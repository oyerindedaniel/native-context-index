import { describe, expect, it } from "vitest";
import {
  resolveDisplayValue,
  resolveFillRatio,
  resolveFillTop,
  resolveTiltDegrees,
} from "../benchmark-vessel-math";

describe("benchmark-vessel-math", () => {
  it("clamps fill ratio between 0 and 1", () => {
    expect(resolveFillRatio({ value: 50, max: 100 })).toBe(0.5);
    expect(resolveFillRatio({ value: -10, max: 100 })).toBe(0);
    expect(resolveFillRatio({ value: 200, max: 100 })).toBe(1);
  });

  it("handles equal min and max", () => {
    expect(resolveFillRatio({ value: 10, min: 10, max: 10 })).toBe(1);
    expect(resolveFillRatio({ value: 2, min: 10, max: 10 })).toBe(0);
  });

  it("tilt increases monotonically with fill", () => {
    const low = resolveTiltDegrees(0.2, 14);
    const high = resolveTiltDegrees(0.8, 14);
    expect(high).toBeGreaterThan(low);
    expect(resolveTiltDegrees(0, 14)).toBe(0);
  });

  it("resolves fill top from bottom origin", () => {
    expect(resolveFillTop(10, 100, 0)).toBe(110);
    expect(resolveFillTop(10, 100, 1)).toBe(10);
    expect(resolveFillTop(10, 100, 0.5)).toBe(60);
  });

  it("maps display value from ratio", () => {
    expect(resolveDisplayValue(0.5, 0, 100)).toBe(50);
    expect(resolveDisplayValue(1, 0, 1200)).toBe(1200);
  });
});
