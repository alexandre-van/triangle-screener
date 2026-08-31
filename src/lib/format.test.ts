import { describe, expect, it } from "vitest";
import { formatCompact, formatPercent, formatPrice } from "./format";

describe("formatPrice", () => {
  it("widens precision as the price shrinks", () => {
    expect(formatPrice(104_233.5)).toBe("104233.50");
    expect(formatPrice(23.5)).toBe("23.5000");
    expect(formatPrice(0.0421)).toBe("0.042100");
    expect(formatPrice(0.00000012)).toBe("0.00000012");
  });

  it("keeps trailing zeros so a column aligns on the decimal", () => {
    const rows = [formatPrice(1.5), formatPrice(2.25)];
    expect(rows.every((r) => r.split(".")[1].length === 4)).toBe(true);
  });
});

describe("formatCompact", () => {
  it("picks the largest fitting unit", () => {
    expect(formatCompact(1_234_567)).toBe("1.23M");
    expect(formatCompact(2_500)).toBe("2.50K");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(4.2e9)).toBe("4.20B");
  });
});

describe("formatPercent", () => {
  it("always carries an explicit sign", () => {
    expect(formatPercent(0.0123)).toBe("+1.23%");
    expect(formatPercent(-0.0123)).toBe("−1.23%");
    expect(formatPercent(0)).toBe("+0.00%");
  });
});
