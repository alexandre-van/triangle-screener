import { z } from "zod";
import { fetchJson, parseOrThrow, toNumber } from "./http";
import { resampleFixed, resampleQuarters } from "./resample";
import { splitSymbol } from "./symbols";
import {
  type Candle,
  ExchangeError,
  type ExchangeAdapter,
  type PairInfo,
  type Timeframe,
} from "./types";

const PROVIDER = "bybit";
const BASE = "https://api.bybit.com";
/** Bybit's documented cap. Default is 200. */
const MAX_PER_REQUEST = 1000;

export type BybitCategory = "spot" | "linear";

/**
 * PLAN.md §5.2. Bybit accepts exactly:
 * 1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, W, M.
 *
 * `3d` and `3M` have no native interval and are built from `D` and `M` by
 * resample.ts. OKX needs neither, which is one of the reasons it is primary.
 */
const INTERVAL: Record<Timeframe, string> = {
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1d": "D",
  "3d": "D",
  "1w": "W",
  "1M": "M",
  "3M": "M",
};

/** How many source bars are needed per output bar for the resampled ones. */
const RESAMPLE_FACTOR: Partial<Record<Timeframe, number>> = {
  "3d": 3,
  "3M": 3,
};

/** [start, open, high, low, close, volume, turnover] — all strings. */
const klineRow = z.array(z.string()).min(7);

/**
 * The envelope is validated on its own, and `result` is left unread until
 * retCode has been checked. A Bybit error response carries `result: {}`, so
 * validating the payload first reports every rate limit as a malformed
 * response — and the scanner's backoff, which is what stands between us and a
 * 10-minute IP ban, never fires.
 */
const bybitEnvelope = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.unknown(),
});

const klineResult = z.object({ list: z.array(klineRow) });

const tickersResult = z.object({
  list: z.array(z.object({ symbol: z.string(), turnover24h: z.string() })),
});

/** Bybit reports business failures in the body with a 200 status. retCode
 * 10006 is its rate limiter, whose penalty is a 10-minute IP ban. */
const assertOk = (retCode: number, retMsg: string): void => {
  if (retCode === 0) return;
  throw new ExchangeError(
    retCode === 10006 ? "rate_limited" : "upstream_error",
    PROVIDER,
    `bybit returned retCode ${retCode}${retMsg ? `: ${retMsg}` : ""}`,
  );
};

const toCandle = (row: readonly string[]): Candle => ({
  // Milliseconds, as a string. Both facts bite silently if missed.
  time: Math.floor(toNumber(PROVIDER, "time", row[0]) / 1000),
  open: toNumber(PROVIDER, "open", row[1]),
  high: toNumber(PROVIDER, "high", row[2]),
  low: toNumber(PROVIDER, "low", row[3]),
  close: toNumber(PROVIDER, "close", row[4]),
  volume: toNumber(PROVIDER, "volume", row[5]),
});

export const createBybitAdapter = (
  category: BybitCategory = "spot",
): ExchangeAdapter => ({
  name: `bybit:${category}`,

  async listPairs(): Promise<PairInfo[]> {
    const url = `${BASE}/v5/market/tickers?category=${category}`;
    const body = await fetchJson(PROVIDER, url, bybitEnvelope);
    assertOk(body.retCode, body.retMsg);
    const result = parseOrThrow(
      PROVIDER,
      "tickers",
      tickersResult,
      body.result,
    );

    const pairs: PairInfo[] = [];
    for (const t of result.list) {
      let parts;
      try {
        parts = splitSymbol(t.symbol);
      } catch {
        continue; // an exotic quote asset we do not screen
      }
      pairs.push({
        symbol: t.symbol,
        base: parts.base,
        quote: parts.quote,
        quoteVolume24h: toNumber(PROVIDER, "turnover24h", t.turnover24h),
      });
    }
    return pairs;
  },

  async getCandles(
    symbol: string,
    tf: Timeframe,
    limit: number,
  ): Promise<Candle[]> {
    const factor = RESAMPLE_FACTOR[tf] ?? 1;
    const want = Math.min(MAX_PER_REQUEST, limit * factor);
    const url =
      `${BASE}/v5/market/kline?category=${category}` +
      `&symbol=${encodeURIComponent(symbol)}&interval=${INTERVAL[tf]}&limit=${want}`;

    const body = await fetchJson(PROVIDER, url, bybitEnvelope);
    assertOk(body.retCode, body.retMsg);
    const result = parseOrThrow(PROVIDER, "kline", klineResult, body.result);

    // Bybit sorts newest first. Reverse once, here, because every consumer
    // downstream assumes oldest first and none of them re-checks.
    const candles = result.list.map(toCandle).reverse();

    if (tf === "3d") return resampleFixed(candles, 3 * 86_400);
    if (tf === "3M") return resampleQuarters(candles);
    return candles;
  },
});
