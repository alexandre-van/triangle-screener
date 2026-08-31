/** PLAN.md §5.1. There is deliberately no `8h`. */
export type Timeframe =
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M"
  | "3M";

export const TIMEFRAMES: readonly Timeframe[] = [
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
  "3M",
] as const;

const TIMEFRAME_SET: ReadonlySet<string> = new Set(TIMEFRAMES);

export const isTimeframe = (v: string): v is Timeframe => TIMEFRAME_SET.has(v);

/** Nominal bar length in seconds. Months are approximate — used only for
 * cache TTLs and rough windowing, never for bucketing. */
export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "6h": 21600,
  "12h": 43200,
  "1d": 86400,
  "3d": 259200,
  "1w": 604800,
  "1M": 2592000,
  "3M": 7776000,
};

export interface Candle {
  /** open time, unix seconds, UTC */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PairInfo {
  symbol: string; // 'BTCUSDT'
  base: string; // 'BTC'
  quote: string; // 'USDT'
  quoteVolume24h: number;
}

export interface ExchangeAdapter {
  readonly name: string;
  listPairs(): Promise<PairInfo[]>;
  /**
   * Candles **oldest first**, and the last one is the currently forming bar.
   * Every consumer must be explicit about whether it keeps it; the pattern
   * engine drops it. PLAN.md §5.1.
   */
  getCandles(symbol: string, tf: Timeframe, limit: number): Promise<Candle[]>;
}

export type ExchangeErrorCode =
  | "unreachable" // network failure, DNS, TLS, timeout
  | "blocked" // 403/451 — the provider refuses this region
  | "rate_limited"
  | "unknown_symbol" // the provider has never heard of this pair
  | "bad_response" // reached it, but the payload failed its schema
  | "upstream_error"; // the provider reported a business error

/**
 * The only error type this layer throws. A malformed upstream response must
 * never reach the UI as `undefined` — PLAN.md §5.1.
 */
export class ExchangeError extends Error {
  readonly code: ExchangeErrorCode;
  readonly provider: string;
  readonly status?: number;

  constructor(
    code: ExchangeErrorCode,
    provider: string,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ExchangeError";
    this.code = code;
    this.provider = provider;
    this.status = options?.status;
  }
}
