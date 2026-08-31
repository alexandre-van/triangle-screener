import pLimit from "p-limit";
import { dropForming } from "../exchange/candles";
import { MIN_CANDLES, scanCandleLimit } from "../exchange/candles";
import {
  ExchangeError,
  type ExchangeAdapter,
  type PairInfo,
  type Timeframe,
} from "../exchange/types";
import { configFor } from "../patterns/config";
import {
  detectTriangles,
  type Direction,
  type TrianglePattern,
} from "../patterns/triangle";

/**
 * §8.2. Orchestration for a full scan.
 *
 * Concurrency is capped low on purpose: Bybit's penalty for overrunning its
 * rate limit is a 10-minute IP ban, which is far worse than a slow scan, and
 * OKX is no more forgiving. Latency, not the limit, is the bottleneck anyway.
 */
export const SCAN_CONCURRENCY = 8;

export type DirectionFilter = "all" | Direction;

export interface ScanOptions {
  timeframe: Timeframe;
  direction: DirectionFilter;
  /** Only patterns at or above this score. */
  minScore?: number;
  concurrency?: number;
  signal?: AbortSignal;
}

/** One line of the stream: a result, a skip, or the final summary. */
export type ScanEvent =
  | { type: "start"; total: number; timeframe: Timeframe; provider: string }
  | { type: "hit"; done: number; pattern: TrianglePattern }
  | { type: "miss"; done: number; symbol: string }
  | { type: "error"; done: number; symbol: string; code: string }
  | { type: "done"; scanned: number; hits: number };

const matches = (pattern: TrianglePattern, options: ScanOptions): boolean => {
  if (options.direction !== "all" && pattern.direction !== options.direction)
    return false;
  if (options.minScore !== undefined && pattern.score < options.minScore)
    return false;
  return true;
};

/**
 * Yields events as pairs complete, so the caller can stream them out rather
 * than buffering a 25-60 second scan. Results arrive in completion order, not
 * universe order — the panel sorts them.
 */
export async function* scan(
  adapter: ExchangeAdapter,
  universe: readonly PairInfo[],
  options: ScanOptions,
): AsyncGenerator<ScanEvent> {
  yield {
    type: "start",
    total: universe.length,
    timeframe: options.timeframe,
    provider: adapter.name,
  };

  const limit = pLimit(options.concurrency ?? SCAN_CONCURRENCY);
  const config = configFor(options.timeframe);
  const queue: ScanEvent[] = [];
  let notify: (() => void) | undefined;

  const push = (event: ScanEvent) => {
    queue.push(event);
    notify?.();
  };

  let done = 0;
  let hits = 0;

  const jobs = universe.map((pair) =>
    limit(async () => {
      if (options.signal?.aborted === true) return;
      try {
        const raw = await adapter.getCandles(
          pair.symbol,
          options.timeframe,
          scanCandleLimit(options.timeframe),
        );
        const candles = dropForming(raw);
        done += 1;

        // Many altcoins simply do not have this much history. Not an error —
        // this pair is just not screenable at this timeframe.
        if (candles.length < MIN_CANDLES) {
          push({ type: "miss", done, symbol: pair.symbol });
          return;
        }

        const found = detectTriangles(candles, {
          symbol: pair.symbol,
          timeframe: options.timeframe,
          config,
        }).filter((p) => matches(p, options));

        if (found.length === 0) {
          push({ type: "miss", done, symbol: pair.symbol });
          return;
        }
        // §6.10: keep the highest-scoring candidate per pair per timeframe.
        hits += 1;
        push({ type: "hit", done, pattern: found[0] });
      } catch (e) {
        done += 1;
        push({
          type: "error",
          done,
          symbol: pair.symbol,
          code: e instanceof ExchangeError ? e.code : "internal_error",
        });
      }
    }),
  );

  const all = Promise.allSettled(jobs).then(() => {
    notify?.();
  });
  let finished = false;
  void all.then(() => {
    finished = true;
    notify?.();
  });

  while (!finished || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      notify = undefined;
      continue;
    }
    const next = queue.shift();
    if (next !== undefined) yield next;
  }

  yield { type: "done", scanned: done, hits };
}
