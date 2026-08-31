import { z } from "zod";
import { fetchJson, toNumber } from "./http";
import { splitSymbol } from "./symbols";
import {
  type Candle,
  ExchangeError,
  type ExchangeAdapter,
  type PairInfo,
  type Timeframe,
} from "./types";

const PROVIDER = "okx";
const BASE = "https://www.okx.com";
/** Hard cap on /market/candles. Anything larger is paginated. */
const MAX_PER_REQUEST = 300;

export type OkxInstType = "SPOT" | "SWAP";

/**
 * OKX serves every timeframe we need natively — including `3d` and `3M`, which
 * Bybit does not have — so no resampling is required here.
 *
 * The `utc` suffix matters. Without it OKX anchors 6H and larger bars to Hong
 * Kong time (UTC+8), and every daily, weekly and monthly candle lands eight
 * hours away from what TradingView shows. Timeframes below 6H have no such
 * variant and need none.
 */
const BAR: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4H",
  "6h": "6Hutc",
  "12h": "12Hutc",
  "1d": "1Dutc",
  "3d": "3Dutc",
  "1w": "1Wutc",
  "1M": "1Mutc",
  "3M": "3Mutc",
};

/** [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] — all strings. */
const candleRow = z.array(z.string()).min(9);

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ code: z.string(), msg: z.string(), data: z.array(data) });

const candlesResponse = envelope(candleRow);

const tickerRow = z.object({
  instId: z.string(),
  volCcy24h: z.string(),
});
const tickersResponse = envelope(tickerRow);

/** OKX signals business failures in the body with a 200 status. */
const assertOk = (code: string, msg: string): void => {
  if (code === "0") return;
  // 51001 is "Instrument ID does not exist" — a client asking for a pair that
  // is not listed, not a fault on OKX's side. Verified against the live API.
  throw new ExchangeError(
    code === "51001" ? "unknown_symbol" : "upstream_error",
    PROVIDER,
    `okx returned code ${code}${msg ? `: ${msg}` : ""}`,
  );
};

const toCandle = (row: readonly string[]): Candle => ({
  time: Math.floor(toNumber(PROVIDER, "time", row[0]) / 1000),
  open: toNumber(PROVIDER, "open", row[1]),
  high: toNumber(PROVIDER, "high", row[2]),
  low: toNumber(PROVIDER, "low", row[3]),
  close: toNumber(PROVIDER, "close", row[4]),
  volume: toNumber(PROVIDER, "volume", row[5]),
});

export const createOkxAdapter = (
  instType: OkxInstType = "SPOT",
): ExchangeAdapter => ({
  name: `okx:${instType.toLowerCase()}`,

  async listPairs(): Promise<PairInfo[]> {
    const url = `${BASE}/api/v5/market/tickers?instType=${instType}`;
    const body = await fetchJson(PROVIDER, url, tickersResponse);
    assertOk(body.code, body.msg);

    const pairs: PairInfo[] = [];
    for (const t of body.data) {
      // SPOT is 'BTC-USDT'; SWAP is 'BTC-USDT-SWAP'. Both split the same way.
      const [base, quote] = t.instId.split("-");
      if (!base || !quote) continue;
      pairs.push({
        symbol: `${base}${quote}`,
        base,
        quote,
        quoteVolume24h: toNumber(PROVIDER, "volCcy24h", t.volCcy24h),
      });
    }
    return pairs;
  },

  async getCandles(
    symbol: string,
    tf: Timeframe,
    limit: number,
  ): Promise<Candle[]> {
    const instId = toInstId(symbol, instType);
    const bar = BAR[tf];

    // OKX returns newest first and pages backwards: `after` asks for bars
    // strictly older than the given timestamp, in milliseconds.
    const collected: Candle[] = [];
    let after: string | undefined;

    while (collected.length < limit) {
      const want = Math.min(MAX_PER_REQUEST, limit - collected.length);
      const url =
        `${BASE}/api/v5/market/candles?instId=${encodeURIComponent(instId)}` +
        `&bar=${bar}&limit=${want}` +
        (after === undefined ? "" : `&after=${after}`);

      const body = await fetchJson(PROVIDER, url, candlesResponse);
      assertOk(body.code, body.msg);
      if (body.data.length === 0) break;

      for (const row of body.data) collected.push(toCandle(row));

      const oldest = body.data[body.data.length - 1][0];
      // A page that does not advance would loop forever.
      if (after === oldest) break;
      after = oldest;

      if (body.data.length < want) break; // history exhausted
    }

    // Oldest first, per the adapter contract. OKX can repeat a boundary bar
    // across pages, so dedupe on the way.
    collected.reverse();
    return dedupeByTime(collected);
  },
});

/** 'BTCUSDT' -> 'BTC-USDT'. The universe stores exchange-neutral symbols. */
export const toInstId = (symbol: string, instType: OkxInstType): string => {
  const { base, quote } = splitSymbol(symbol);
  return instType === "SWAP" ? `${base}-${quote}-SWAP` : `${base}-${quote}`;
};

const dedupeByTime = (candles: readonly Candle[]): Candle[] => {
  const out: Candle[] = [];
  for (const c of candles) {
    const prev = out[out.length - 1];
    if (prev === undefined || prev.time !== c.time) out.push(c);
  }
  return out;
};
