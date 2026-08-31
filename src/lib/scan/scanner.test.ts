import { describe, expect, it, vi } from "vitest";
import type { Candle, ExchangeAdapter, PairInfo } from "../exchange/types";
import { ExchangeError } from "../exchange/types";
import { scan, type ScanEvent } from "./scanner";

const pair = (symbol: string): PairInfo => ({
  symbol,
  base: symbol.replace("USDT", ""),
  quote: "USDT",
  quoteVolume24h: 1,
});

/** A long enough flat series to clear minCandles but hold no pattern. */
const flat = (n = 200): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: 100,
    high: 100.1,
    low: 99.9,
    close: 100,
    volume: 1,
  }));

const adapterOf = (
  candlesFor: (symbol: string) => Promise<Candle[]>,
): ExchangeAdapter => ({
  name: "fake",
  listPairs: async () => [],
  getCandles: (symbol) => candlesFor(symbol),
});

const collect = async (
  gen: AsyncGenerator<ScanEvent>,
): Promise<ScanEvent[]> => {
  const out: ScanEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
};

const options = { timeframe: "1h" as const, direction: "all" as const };

describe("scan", () => {
  it("opens with a start event carrying the total", async () => {
    const events = await collect(
      scan(
        adapterOf(async () => flat()),
        [pair("BTCUSDT"), pair("ETHUSDT")],
        options,
      ),
    );
    expect(events[0]).toMatchObject({
      type: "start",
      total: 2,
      provider: "fake",
    });
  });

  it("closes with a done event counting what was scanned", async () => {
    const events = await collect(
      scan(
        adapterOf(async () => flat()),
        [pair("BTCUSDT"), pair("ETHUSDT")],
        options,
      ),
    );
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      scanned: 2,
      hits: 0,
    });
  });

  it("reports a pair with too little history as a miss, not an error", async () => {
    const events = await collect(
      scan(
        adapterOf(async () => flat(30)),
        [pair("NEWUSDT")],
        options,
      ),
    );
    expect(
      events.some((e) => e.type === "miss" && e.symbol === "NEWUSDT"),
    ).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("turns an exchange failure into an error event and keeps going", async () => {
    const adapter = adapterOf(async (symbol) => {
      if (symbol === "BADUSDT")
        throw new ExchangeError("rate_limited", "fake", "slow down");
      return flat();
    });
    const events = await collect(
      scan(
        adapter,
        [pair("BADUSDT"), pair("BTCUSDT"), pair("ETHUSDT")],
        options,
      ),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        symbol: "BADUSDT",
        code: "rate_limited",
      }),
    );
    // The other two still completed.
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      scanned: 3,
    });
  });

  it("labels an unexpected throw internal_error rather than leaking it", async () => {
    const adapter = adapterOf(async () => {
      throw new TypeError("boom");
    });
    const events = await collect(scan(adapter, [pair("XUSDT")], options));
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "internal_error" }),
    );
  });

  it("counts progress monotonically so a live counter never goes backwards", async () => {
    const universe = Array.from({ length: 12 }, (_, i) => pair(`P${i}USDT`));
    const events = await collect(
      scan(
        adapterOf(async () => flat()),
        universe,
        options,
      ),
    );
    const progress = events.flatMap((e) => ("done" in e ? [e.done] : []));
    expect(progress).toHaveLength(12);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }
    expect(progress[progress.length - 1]).toBe(12);
  });

  it("caps concurrency so a scan cannot earn a rate-limit ban", async () => {
    let inFlight = 0;
    let peak = 0;
    const adapter = adapterOf(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return flat();
    });
    const universe = Array.from({ length: 30 }, (_, i) => pair(`P${i}USDT`));
    await collect(scan(adapter, universe, { ...options, concurrency: 4 }));
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("stops issuing requests once aborted", async () => {
    const controller = new AbortController();
    const getCandles = vi.fn(async () => flat());
    const universe = Array.from({ length: 20 }, (_, i) => pair(`P${i}USDT`));
    controller.abort();
    await collect(
      scan(adapterOf(getCandles), universe, {
        ...options,
        signal: controller.signal,
        concurrency: 2,
      }),
    );
    expect(getCandles).not.toHaveBeenCalled();
  });

  it("yields nothing but start and done for an empty universe", async () => {
    const events = await collect(
      scan(
        adapterOf(async () => flat()),
        [],
        options,
      ),
    );
    expect(events.map((e) => e.type)).toEqual(["start", "done"]);
  });
});
