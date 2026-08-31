import type { Candle, Timeframe } from "@/lib/exchange/types";
import type { TrianglePattern } from "@/lib/patterns/triangle";

/** Response shape of GET /api/klines. */
export interface KlinesResponse {
  symbol: string;
  timeframe: Timeframe;
  provider: string;
  count: number;
  candles: Candle[];
  patterns: TrianglePattern[];
}

export interface ApiError {
  error: { code: string; message: string };
}
