import { afterEach, describe, expect, it, vi } from "vitest";
import candlesFixture from "./__fixtures__/okx-candles.json";
import tickersFixture from "./__fixtures__/okx-tickers.json";
import { createOkxAdapter, toInstId } from "./okx";
import { ExchangeError } from "./types";

/** Recorded OKX responses; captured by scripts/spike-exchange.mjs. */
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

const okx = createOkxAdapter();

describe("getCandles", () => {
  it("returns oldest first — OKX sends newest first", async () => {
    stubFetch(() => json(candlesFixture));
    const out = await okx.getCandles("BTCUSDT", "1h", 6);

    const times = out.map((c) => c.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(out).toHaveLength(6);
  });

  it("converts millisecond strings into second numbers", async () => {
    stubFetch(() => json(candlesFixture));
    const [, ...rest] = await okx.getCandles("BTCUSDT", "1h", 6);
    const last = rest[rest.length - 1];

    // The newest row in the fixture: 1788184800000 ms, open 77863.9.
    expect(last.time).toBe(1_788_184_800);
    expect(last.open).toBeCloseTo(77_863.9);
    expect(last.high).toBeCloseTo(78_678.5);
    expect(last.low).toBeCloseTo(77_750.1);
    expect(last.close).toBeCloseTo(78_659.8);
    expect(typeof last.time).toBe("number");
  });

  it("keeps the forming bar — dropping it is the caller's job", async () => {
    stubFetch(() => json(candlesFixture));
    const out = await okx.getCandles("BTCUSDT", "1h", 6);
    // The fixture's newest row carries confirm "0". It survives, as the last.
    expect(out[out.length - 1].time).toBe(1_788_184_800);
  });

  it("anchors 6h and larger to UTC, not Hong Kong time", async () => {
    const spy = stubFetch(() => json(candlesFixture));
    await okx.getCandles("BTCUSDT", "1d", 6);
    expect(spy.mock.calls[0][0]).toContain("bar=1Dutc");
  });

  it("uses the plain bar below 6h, where no utc variant exists", async () => {
    const spy = stubFetch(() => json(candlesFixture));
    await okx.getCandles("BTCUSDT", "4h", 6);
    expect(String(spy.mock.calls[0][0])).toContain("bar=4H");
    expect(String(spy.mock.calls[0][0])).not.toContain("utc");
  });

  it("pages backwards past the 300-bar cap and dedupes the seam", async () => {
    // Two full pages of 300, then a short page that ends the walk.
    const page = (startMs: number, n: number) => ({
      code: "0",
      msg: "",
      data: Array.from({ length: n }, (_, i) => [
        String(startMs - i * 3_600_000),
        "1",
        "2",
        "0.5",
        "1.5",
        "10",
        "10",
        "10",
        "1",
      ]),
    });
    // Each page restarts at the previous page's oldest bar, which is what OKX
    // does with `after` — the seam bar is delivered twice.
    const HOUR = 3_600_000;
    const START = 1_000_000_000_000;
    let call = 0;
    const spy = stubFetch(() => {
      call += 1;
      if (call === 1) return json(page(START, 300));
      if (call === 2) return json(page(START - 299 * HOUR, 300));
      return json(page(START - 598 * HOUR, 100));
    });

    const out = await okx.getCandles("BTCUSDT", "1h", 700);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(String(spy.mock.calls[1][0])).toContain("after=");
    // 700 rows fetched, minus the two boundary bars repeated across pages.
    expect(out).toHaveLength(698);
    const times = out.map((c) => c.time);
    expect(new Set(times).size).toBe(times.length);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("stops rather than looping when a page does not advance", async () => {
    const stuck = {
      code: "0",
      msg: "",
      data: [["1000", "1", "2", "0.5", "1.5", "10", "10", "10", "1"]],
    };
    const spy = stubFetch(() => json(stuck));
    await okx.getCandles("BTCUSDT", "1h", 1000);
    expect(spy.mock.calls.length).toBeLessThan(4);
  });
});

describe("listPairs", () => {
  it("normalises instId into a symbol, base and quote", async () => {
    stubFetch(() => json(tickersFixture));
    const pairs = await okx.listPairs();

    const btc = pairs.find((p) => p.symbol === "BTCUSDT");
    expect(btc).toMatchObject({
      symbol: "BTCUSDT",
      base: "BTC",
      quote: "USDT",
    });
    expect(btc?.quoteVolume24h).toBeGreaterThan(0);
    expect(pairs.map((p) => p.symbol)).toContain("ETHBTC");
  });
});

describe("errors", () => {
  it("maps a 403 to a blocked ExchangeError, not a crash", async () => {
    stubFetch(() => json({}, 403));
    await expect(okx.listPairs()).rejects.toMatchObject({
      name: "ExchangeError",
      code: "blocked",
      status: 403,
    });
  });

  it("maps a 429 to rate_limited", async () => {
    stubFetch(() => json({}, 429));
    await expect(okx.listPairs()).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("rejects a payload that fails the schema", async () => {
    stubFetch(() => json({ code: "0", msg: "", data: [{ nope: true }] }));
    await expect(okx.getCandles("BTCUSDT", "1h", 5)).rejects.toMatchObject({
      code: "bad_response",
    });
  });

  it("surfaces an OKX business error carried on a 200", async () => {
    stubFetch(() =>
      json({ code: "50011", msg: "Rate limit reached", data: [] }),
    );
    await expect(okx.getCandles("BTCUSDT", "1h", 5)).rejects.toMatchObject({
      code: "upstream_error",
    });
  });

  it("separates an unlisted pair from a fault on OKX's side", async () => {
    // 51001 means the caller asked for something that does not exist, which
    // is a 404 downstream, not a bad gateway.
    stubFetch(() =>
      json({ code: "51001", msg: "Instrument ID does not exist", data: [] }),
    );
    await expect(okx.getCandles("NOPEUSDT", "1h", 5)).rejects.toMatchObject({
      code: "unknown_symbol",
    });
  });

  it("turns a network failure into unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    );
    await expect(okx.listPairs()).rejects.toMatchObject({
      code: "unreachable",
    });
  });
});

describe("toInstId", () => {
  it("splits a symbol on its quote asset", () => {
    expect(toInstId("BTCUSDT", "SPOT")).toBe("BTC-USDT");
    expect(toInstId("ETHBTC", "SPOT")).toBe("ETH-BTC");
    expect(toInstId("BTCUSDT", "SWAP")).toBe("BTC-USDT-SWAP");
  });

  it("prefers the longer quote where two could match", () => {
    // USDC ends in neither USDT nor BTC; USDT must not steal from USDC.
    expect(toInstId("BTCUSDC", "SPOT")).toBe("BTC-USDC");
  });

  it("throws rather than guessing at an unsplittable symbol", () => {
    expect(() => toInstId("WAT", "SPOT")).toThrow(ExchangeError);
  });
});
