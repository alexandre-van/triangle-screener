/**
 * A pacer, one per provider. PLAN.md §5.4.
 *
 * OKX allows 40 requests per 2 seconds per IP on /market/candles; Bybit's
 * penalty for overrunning is a 10-minute IP ban. Concurrency limits alone do
 * not control the *rate* — eight workers each finishing in 100ms is 80
 * requests a second — so every provider call is spaced by this instead.
 *
 * Discovered the hard way: a 200-pair scan at concurrency 8 with no pacing
 * came back with 135 pairs rate-limited and looked, from the hit count alone,
 * like it had worked.
 */
export type Pacer = <T>(fn: () => Promise<T>) => Promise<T>;

export const createPacer = (
  requestsPerSecond: number,
  now = () => Date.now(),
): Pacer => {
  const interval = 1000 / requestsPerSecond;
  let nextStart = 0;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const at = Math.max(now(), nextStart);
    nextStart = at + interval;
    const wait = at - now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return fn();
  };
};

/** Exponential backoff with jitter, so retries do not resynchronise. */
export const backoffMs = (attempt: number, random = Math.random): number =>
  Math.round(2 ** attempt * 250 * (0.5 + random()));
