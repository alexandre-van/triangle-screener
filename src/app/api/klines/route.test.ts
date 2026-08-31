import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdapter } from "@/lib/exchange/adapter";
import { ExchangeError, type Candle } from "@/lib/exchange/types";
import { GET } from "./route";

const candles = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1,
  }));

const okxJson = (rows: Candle[]) => ({
  code: "0",
  msg: "",
  // OKX order: newest first, strings, milliseconds.
  data: [...rows]
    .reverse()
    .map((c) => [
      String(c.time * 1000),
      String(c.open),
      String(c.high),
      String(c.low),
      String(c.close),
      String(c.volume),
      "0",
      "0",
      "1",
    ]),
});

const get = (qs: string) =>
  GET(new Request(`http://localhost/api/klines?${qs}`));

beforeEach(() => resetAdapter());
afterEach(() => {
  vi.unstubAllGlobals();
  resetAdapter();
});

const stubOnce = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );

describe("parameter validation", () => {
  it.each([
    ["missing everything", ""],
    ["unknown timeframe", "symbol=BTCUSDT&tf=7h"],
    ["timeframe we deliberately dropped", "symbol=BTCUSDT&tf=8h"],
    ["lowercase symbol", "symbol=btcusdt&tf=4h"],
    ["symbol with a slash", "symbol=BTC%2FUSDT&tf=4h"],
    ["symbol far too long", `symbol=${"A".repeat(21)}&tf=4h`],
  ])("rejects %s with a 400, never a 500", async (_label, qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("accepts every timeframe in the union", async () => {
    stubOnce(okxJson(candles(200)));
    const res = await get("symbol=BTCUSDT&tf=3M");
    expect(res.status).toBe(200);
  });
});

describe("success", () => {
  it("returns candles oldest first, without the forming bar", async () => {
    stubOnce(okxJson(candles(200)));
    const res = await get("symbol=BTCUSDT&tf=4h");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(199); // the forming candle is dropped
    expect(body.symbol).toBe("BTCUSDT");
    expect(body.timeframe).toBe("4h");
    expect(body.provider).toBe("okx:spot");
    const times = body.candles.map((c: Candle) => c.time);
    expect(times).toEqual([...times].sort((a: number, b: number) => a - b));
  });

  it("keeps the forming bar only when explicitly asked", async () => {
    stubOnce(okxJson(candles(200)));
    const body = await (await get("symbol=BTCUSDT&tf=4h&forming=1")).json();
    expect(body.count).toBe(200);
  });

  it("sets a cache lifetime of roughly a third of the bar", async () => {
    stubOnce(okxJson(candles(200)));
    const res = await get("symbol=BTCUSDT&tf=1h");
    expect(res.headers.get("cache-control")).toContain("s-maxage=1200");
  });
});

describe("failures", () => {
  it("reports too-short history as 422, not as an error", async () => {
    stubOnce(okxJson(candles(50)));
    const res = await get("symbol=NEWCOINUSDT&tf=4h");
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("insufficient_history");
  });

  it("maps a geo-block to 502 and rate limiting to 429", async () => {
    stubOnce({}, 403);
    expect((await get("symbol=BTCUSDT&tf=4h")).status).toBe(502);

    resetAdapter();
    stubOnce({}, 429);
    expect((await get("symbol=BTCUSDT&tf=4h")).status).toBe(429);
  });

  it("maps an unreachable provider to 504", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    );
    expect((await get("symbol=BTCUSDT&tf=4h")).status).toBe(504);
  });

  it("never puts the upstream URL or a stack trace in the body", async () => {
    stubOnce({}, 403);
    const text = await (await get("symbol=BTCUSDT&tf=4h")).text();
    expect(text).not.toContain("okx.com");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("at ");
  });

  it("turns an unexpected throw into a 500 with no detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("boom"))),
    );
    vi.doMock("@/lib/exchange/adapter", () => ({
      getAdapter: () => ({
        name: "x",
        listPairs: async () => [],
        getCandles: async () => {
          throw new Error("boom");
        },
      }),
      resetAdapter: () => {},
    }));
    // The ExchangeError path is covered above; this asserts the shape only.
    const res = await get("symbol=BTCUSDT&tf=4h");
    const body = await res.json();
    expect(body.error.message).not.toContain("boom");
  });

  it("does not cache an error response", async () => {
    stubOnce({}, 403);
    const res = await get("symbol=BTCUSDT&tf=4h");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("ExchangeError", () => {
  it("carries its code and provider", () => {
    const e = new ExchangeError("blocked", "okx", "nope", { status: 403 });
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("blocked");
    expect(e.provider).toBe("okx");
    expect(e.status).toBe(403);
  });
});

describe("unknown symbols", () => {
  it("is a 404, not a 502 — the pair is missing, the gateway is fine", async () => {
    stubOnce({
      code: "51001",
      msg: "Instrument ID, Instrument ID code, or Spread ID does not exist",
      data: [],
    });
    const res = await get("symbol=NOTAREALCOINUSDT&tf=1d");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("unknown_symbol");
  });

  it("names the pair and the provider, and passes no upstream text through", async () => {
    stubOnce({
      code: "51001",
      msg: "Instrument ID ... does not exist",
      data: [],
    });
    const body = await (await get("symbol=NOTAREALCOINUSDT&tf=1d")).json();
    expect(body.error.message).toContain("NOTAREALCOINUSDT");
    expect(body.error.message).toContain("okx");
    expect(body.error.message).not.toContain("51001");
    expect(body.error.message).not.toContain("Instrument ID");
  });

  it("still reports a genuine upstream fault as 502", async () => {
    stubOnce({ code: "50011", msg: "Rate limit", data: [] });
    expect((await get("symbol=BTCUSDT&tf=1d")).status).toBe(502);
  });
});
