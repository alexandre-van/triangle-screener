import { describe, expect, it } from "vitest";
import type { Candle } from "./types";
import { EPOCH_MONDAY, resampleFixed, resampleQuarters } from "./resample";

const DAY = 86_400;

/** A daily candle whose OHLC encodes its index, so merges are checkable. */
const day = (time: number, i: number): Candle => ({
  time,
  open: 100 + i,
  high: 110 + i,
  low: 90 + i,
  close: 105 + i,
  volume: 10,
});

const daysFrom = (start: number, n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => day(start + i * DAY, i));

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;

describe("resampleFixed — 3d groups", () => {
  it("anchors groups to the epoch Monday, not to the first candle", () => {
    // 1970-01-05 is the anchor, so groups open on the 5th, 8th, 11th...
    const out = resampleFixed(daysFrom(EPOCH_MONDAY, 9), 3 * DAY);
    expect(out.map((c) => c.time)).toEqual([
      EPOCH_MONDAY,
      EPOCH_MONDAY + 3 * DAY,
      EPOCH_MONDAY + 6 * DAY,
    ]);
  });

  it("takes first open, last close, max high, min low and summed volume", () => {
    const [first] = resampleFixed(daysFrom(EPOCH_MONDAY, 3), 3 * DAY);
    expect(first).toEqual({
      time: EPOCH_MONDAY,
      open: 100, // candle 0
      high: 112, // candle 2
      low: 90, // candle 0
      close: 107, // candle 2
      volume: 30,
    });
  });

  it("drops a leading group that does not start on its boundary", () => {
    // Start one day late: the first bucket is missing its opening day, so its
    // open/high/low would all be wrong.
    const out = resampleFixed(daysFrom(EPOCH_MONDAY + DAY, 8), 3 * DAY);
    expect(out[0].time).toBe(EPOCH_MONDAY + 3 * DAY);
  });

  it("keeps a trailing partial group — that is the forming bar", () => {
    const out = resampleFixed(daysFrom(EPOCH_MONDAY, 4), 3 * DAY);
    expect(out).toHaveLength(2);
    expect(out[1].volume).toBe(10); // one day so far
  });

  it("returns nothing for an empty series", () => {
    expect(resampleFixed([], 3 * DAY)).toEqual([]);
  });

  it("rejects a non-positive bucket", () => {
    expect(() => resampleFixed(daysFrom(EPOCH_MONDAY, 3), 0)).toThrow(
      RangeError,
    );
  });
});

describe("resampleQuarters", () => {
  /** One monthly candle per month, starting at `start`. */
  const months = (startYear: number, startMonth: number, n: number): Candle[] =>
    Array.from({ length: n }, (_, i) =>
      day(Date.UTC(startYear, startMonth - 1 + i, 1) / 1000, i),
    );

  it("aligns to Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec", () => {
    const out = resampleQuarters(months(2024, 1, 12));
    expect(out.map((c) => c.time)).toEqual([
      utc(2024, 1, 1),
      utc(2024, 4, 1),
      utc(2024, 7, 1),
      utc(2024, 10, 1),
    ]);
  });

  it("crosses a year boundary without drifting", () => {
    // Oct 2024 through Jun 2025: Q4 2024, Q1 2025, Q2 2025.
    const out = resampleQuarters(months(2024, 10, 9));
    expect(out.map((c) => c.time)).toEqual([
      utc(2024, 10, 1),
      utc(2025, 1, 1),
      utc(2025, 4, 1),
    ]);
    expect(out[1].volume).toBe(30); // Jan, Feb, Mar
  });

  it("drops a leading part-quarter", () => {
    // Starts in February: Q1 is missing January.
    const out = resampleQuarters(months(2024, 2, 8));
    expect(out[0].time).toBe(utc(2024, 4, 1));
  });

  it("is not a rolling 3-month window", () => {
    const out = resampleQuarters(months(2024, 1, 6));
    expect(out).toHaveLength(2);
    expect(out[0].volume).toBe(30);
  });
});
