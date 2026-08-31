import { readFileSync } from "node:fs";
import type { Candle } from "../../exchange/types";

/**
 * Reads a committed OHLC CSV from docs/fixtures/. Test-only: the pattern
 * engine itself never touches the filesystem.
 */
export const loadFixture = (name: string): Candle[] => {
  const url = new URL(`../../../../docs/fixtures/${name}.csv`, import.meta.url);
  const [, ...rows] = readFileSync(url, "utf8").trim().split("\n");
  return rows.map((row) => {
    const [date, open, high, low, close, volume] = row.split(",");
    return {
      time: Date.parse(`${date}T00:00:00Z`) / 1000,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    };
  });
};

export const dateOf = (time: number): string =>
  new Date(time * 1000).toISOString().slice(0, 10);

export const indexOfDate = (candles: readonly Candle[], date: string): number =>
  candles.findIndex((c) => dateOf(c.time) === date);

/** The hand-verified pivots from PLAN.md §7, in chronological order. */
export const HERMES_PIVOTS = [
  "2000-11-06", // H1
  "2001-09-17", // L1
  "2001-12-03", // H2
  "2003-03-10", // L2
  "2004-04-05", // H3
  "2004-12-06", // L3
] as const;

export const BOEING_PIVOTS = [
  "2020-03-16", // L1
  "2021-03-15", // H1
  "2022-06-13", // L2
  "2023-12-18", // H2
  "2025-04-07", // L3
  "2026-01-26", // H3
] as const;
