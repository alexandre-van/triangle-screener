import { afterEach, describe, expect, it, vi } from "vitest";
import { createBybitAdapter } from "./bybit";

/**
 * Bybit 403s from every environment available here — a US runner and a Bali
 * laptop both — so unlike the OKX tests these payloads are built from the
 * documented shape in PLAN.md §5.2 rather than recorded from the wire. They
 * pin the three quirks the adapter exists to absorb, not Bybit's live
 * behaviour. See docs/decisions.md, 2026-08-31.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const stubFetch = (impl: (url: string) => Response) => {
  const spy = vi.fn((input: string | URL | Request) =>
    Promise.resolve(impl(String(input))),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
};

afterEach(() => vi.unstubAllGlobals());

const bybit = createBybitAdapter();

/** Newest first, strings, millisecond timestamps — all three at once. */
const kline = (rows: readonly (readonly [number, number])[]) => ({
  retCode: 0,
  retMsg: "OK",
  result: {
    list: rows.map(([ms, price]) => [
      String(ms),
      String(price),
      String(price + 2),
      String(price - 2),
      String(price + 1),
      "10",
      "1000",
    ]),
  },
});

const DAY_MS = 86_400_000;

describe("the three response quirks", () => {
  it("reverses newest-first into oldest-first", async () => {
    stubFetch(() =>
      json(
        kline([
          [3 * DAY_MS, 30],
          [2 * DAY_MS, 20],
          [1 * DAY_MS, 10],
        ]),
      ),
    );
    const out = await bybit.getCandles("BTCUSDT", "1h", 3);
    expect(out.map((c) => c.open)).toEqual([10, 20, 30]);
  });

  it("coerces strings to numbers and milliseconds to seconds", async () => {
    stubFetch(() => json(kline([[1_700_000_000_000, 42]])));
    const [c] = await bybit.getCandles("BTCUSDT", "1h", 1);
    expect(c).toEqual({
      time: 1_700_000_000,
      open: 42,
      high: 44,
      low: 40,
      close: 43,
      volume: 10,
    });
    expect(typeof c.time).toBe("number");
  });

  it("rejects a non-numeric price rather than yielding NaN", async () => {
    stubFetch(() =>
      json({
        retCode: 0,
        retMsg: "OK",
        result: { list: [["1700000000000", "n/a", "1", "1", "1", "1", "1"]] },
      }),
    );
    await expect(bybit.getCandles("BTCUSDT", "1h", 1)).rejects.toMatchObject({
      code: "bad_response",
    });
  });
});

describe("intervals Bybit does not have", () => {
  it("builds 3d from daily bars", async () => {
    // Six days from the epoch Monday anchor, newest first.
    const anchorMs = 345_600_000;
    const rows = Array.from({ length: 6 }, (_, i) => [
      anchorMs + (5 - i) * DAY_MS,
      10 + (5 - i),
    ]) as [number, number][];
    const spy = stubFetch(() => json(kline(rows)));

    const out = await bybit.getCandles("BTCUSDT", "3d", 2);

    expect(String(spy.mock.calls[0][0])).toContain("interval=D");
    expect(out).toHaveLength(2);
    expect(out[0].open).toBe(10); // first day of the first group
    expect(out[0].close).toBe(13); // third day's close: 12 + 1
    expect(out[0].volume).toBe(30);
  });

  it("builds 3M from monthly bars on calendar quarters", async () => {
    const months = [0, 1, 2, 3, 4, 5].map((m) => Date.UTC(2024, m, 1));
    const rows = months
      .map((ms, i) => [ms, 10 + i] as [number, number])
      .reverse();
    const spy = stubFetch(() => json(kline(rows)));

    const out = await bybit.getCandles("BTCUSDT", "3M", 2);

    expect(String(spy.mock.calls[0][0])).toContain("interval=M");
    expect(out.map((c) => c.time)).toEqual([
      Date.UTC(2024, 0, 1) / 1000,
      Date.UTC(2024, 3, 1) / 1000,
    ]);
  });

  it("asks for enough source bars to build the requested count", async () => {
    const spy = stubFetch(() => json(kline([[DAY_MS, 1]])));
    await bybit.getCandles("BTCUSDT", "3d", 100);
    expect(String(spy.mock.calls[0][0])).toContain("limit=300");
  });

  it("never asks for more than the 1000-bar cap", async () => {
    const spy = stubFetch(() => json(kline([[DAY_MS, 1]])));
    await bybit.getCandles("BTCUSDT", "3d", 900);
    expect(String(spy.mock.calls[0][0])).toContain("limit=1000");
  });
});

describe("errors", () => {
  it("treats retCode 10006 as rate limiting, since the penalty is a 10-minute ban", async () => {
    stubFetch(() =>
      json({ retCode: 10006, retMsg: "Too many visits", result: {} }),
    );
    await expect(bybit.getCandles("BTCUSDT", "1h", 1)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("maps a 403 to blocked — this is what Bybit actually does from the US", async () => {
    stubFetch(() => json({}, 403));
    await expect(bybit.listPairs()).rejects.toMatchObject({
      code: "blocked",
      status: 403,
    });
  });
});

describe("listPairs", () => {
  it("splits the concatenated symbol and skips exotic quotes", async () => {
    stubFetch(() =>
      json({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            { symbol: "BTCUSDT", turnover24h: "123.5" },
            { symbol: "WAT", turnover24h: "1" },
          ],
        },
      }),
    );
    const pairs = await bybit.listPairs();
    expect(pairs).toEqual([
      { symbol: "BTCUSDT", base: "BTC", quote: "USDT", quoteVolume24h: 123.5 },
    ]);
  });
});
