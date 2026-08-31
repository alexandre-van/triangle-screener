/** Significant digits shown for a price, chosen from its magnitude. */
const priceDigits = (value: number): number => {
  const abs = Math.abs(value);
  if (abs >= 1000) return 2;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 6;
  return 8;
};

/**
 * Crypto prices span BTC at ~100000 and shitcoins at ~0.00000012, so a fixed
 * precision is useless. Trailing zeros are kept: a screener column has to align
 * on the decimal point.
 */
export const formatPrice = (value: number): string =>
  value.toFixed(priceDigits(value));

/** 1_234_567 -> "1.23M". Used for 24h quote volume in the screener. */
export const formatCompact = (value: number): string => {
  const units = [
    { limit: 1e12, suffix: "T" },
    { limit: 1e9, suffix: "B" },
    { limit: 1e6, suffix: "M" },
    { limit: 1e3, suffix: "K" },
  ];
  const abs = Math.abs(value);
  const unit = units.find((u) => abs >= u.limit);
  if (!unit) return value.toFixed(0);
  return `${(value / unit.limit).toFixed(2)}${unit.suffix}`;
};

/** Signed percentage, two decimals: 0.0123 -> "+1.23%". */
export const formatPercent = (ratio: number): string =>
  `${ratio >= 0 ? "+" : "−"}${(Math.abs(ratio) * 100).toFixed(2)}%`;
