import { describe, expect, it } from "vitest";
import { apexBarIndex, fitLine, valueAt } from "./trendline";

describe("fitLine", () => {
  it("passes exactly through two points", () => {
    const line = fitLine(
      [
        { index: 0, price: 100 },
        { index: 10, price: 120 },
      ],
      "above",
    );
    expect(line.slope).toBe(2);
    expect(valueAt(line, 0)).toBeCloseTo(100);
    expect(valueAt(line, 10)).toBeCloseTo(120);
    expect(line.fitError).toBe(0);
  });

  it("least-squares fits three points and reports the residual", () => {
    const points = [
      { index: 0, price: 100 },
      { index: 10, price: 111 },
      { index: 20, price: 120 },
    ];
    const line = fitLine(points, "above");
    expect(line.slope).toBeCloseTo(1, 5);
    expect(line.fitError).toBeGreaterThan(0);
  });

  it("translates resistance so no high pokes above it", () => {
    const points = [
      { index: 0, price: 100 },
      { index: 10, price: 115 }, // bulges above the trend
      { index: 20, price: 120 },
    ];
    const line = fitLine(points, "above");
    for (const p of points) {
      expect(valueAt(line, p.index)).toBeGreaterThanOrEqual(p.price - 1e-9);
    }
    // It touches the most extreme point rather than floating above everything.
    const gaps = points.map((p) => valueAt(line, p.index) - p.price);
    expect(Math.min(...gaps)).toBeCloseTo(0, 9);
  });

  it("translates support so no low pokes below it", () => {
    const points = [
      { index: 0, price: 100 },
      { index: 10, price: 104 }, // dips below the trend
      { index: 20, price: 120 },
    ];
    const line = fitLine(points, "below");
    for (const p of points) {
      expect(valueAt(line, p.index)).toBeLessThanOrEqual(p.price + 1e-9);
    }
  });

  it("refuses to fit a line to one point", () => {
    expect(() => fitLine([{ index: 0, price: 1 }], "above")).toThrow(
      RangeError,
    );
  });
});

describe("apexBarIndex", () => {
  it("finds where converging lines meet", () => {
    const resistance = { slope: -1, intercept: 100, anchorBarIndex: 0 };
    const support = { slope: 1, intercept: 0, anchorBarIndex: 0 };
    expect(apexBarIndex(resistance, support)).toBe(50);
  });

  it("is undefined for parallel lines rather than Infinity", () => {
    const a = { slope: 1, intercept: 0, anchorBarIndex: 0 };
    const b = { slope: 1, intercept: 10, anchorBarIndex: 0 };
    expect(apexBarIndex(a, b)).toBeUndefined();
  });

  it("can sit far in the future without that being a problem", () => {
    // Boeing's apex is 486 bars past L3. There is no apex-distance rule.
    const resistance = { slope: -0.01, intercept: 100, anchorBarIndex: 0 };
    const support = { slope: 0.01, intercept: 90, anchorBarIndex: 0 };
    expect(apexBarIndex(resistance, support)).toBe(500);
  });
});
