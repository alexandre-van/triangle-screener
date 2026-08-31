import type { PairInfo } from "../exchange/types";

/**
 * §8.1. Which pairs the scanner looks at.
 *
 * The filters are pure and exported separately from the caching loader so they
 * can be tested without a network.
 */

/**
 * Stable and fiat units. A pair of two of these has no chart worth screening —
 * whatever shape it makes is noise around a peg.
 *
 * A fixed list always lags: USDG shipped, ranked into the top 200, and scored
 * 66.2 on the first live scan. So the list is backed by `looksLikeStable`,
 * which catches the naming convention rather than the instance.
 */
const STABLE = new Set([
  "USDT",
  "USDC",
  "TUSD",
  "FDUSD",
  "BUSD",
  "USDP",
  "GUSD",
  "PYUSD",
  "USDE",
  "DAI",
  "EURT",
  "EURS",
  "USD",
  "EUR",
  "GBP",
  "TRY",
  "BRL",
  "AUD",
  "JPY",
]);

/**
 * Leveraged tokens track a multiple of the underlying and rebalance daily, so
 * their candles are a decay curve rather than a market. OKX uses `3L`/`3S`
 * suffixes; other venues use `UP`/`DOWN`/`BULL`/`BEAR`.
 */
const LEVERAGED = /(\d+[LS]|UP|DOWN|BULL|BEAR|HALF|HEDGE)$/;

export const isLeveraged = (base: string): boolean => LEVERAGED.test(base);

/**
 * Dollar and euro tokens name themselves after the unit they track: USDT,
 * USDC, USDG, USDE, USD0, PYUSD, FDUSD, RLUSD, LUSD, EURC. Matching the
 * convention catches next month's launch without an edit here.
 */
export const looksLikeStable = (ticker: string): boolean => {
  const t = ticker.toUpperCase();
  return (
    STABLE.has(t) ||
    // Exactly one suffix character: USDT, USDC, USDG, USDE, USD0, EURC. Two
    // would swallow ordinary tickers like EURO3.
    /^(USD|EUR)[A-Z0-9]?$/.test(t) ||
    /(USD|EUR)$/.test(t)
  );
};

export const isStableToStable = (pair: PairInfo): boolean =>
  looksLikeStable(pair.base) && looksLikeStable(pair.quote);

export interface UniverseOptions {
  /** Quote assets to keep. */
  quotes: readonly string[];
  size: number;
}

export const DEFAULT_UNIVERSE: UniverseOptions = {
  quotes: ["USDT"],
  size: 200,
};

export const readUniverseOptions = (
  env: Record<string, string | undefined> = process.env,
): UniverseOptions => {
  const quotes = (env.SCAN_QUOTE_ASSETS ?? "USDT")
    .split(",")
    .map((q) => q.trim().toUpperCase())
    .filter((q) => q.length > 0);

  const parsed = Number(env.SCAN_UNIVERSE_SIZE);
  const size =
    Number.isInteger(parsed) && parsed > 0 && parsed <= 1000
      ? parsed
      : DEFAULT_UNIVERSE.size;

  return { quotes: quotes.length > 0 ? quotes : DEFAULT_UNIVERSE.quotes, size };
};

/** Filter, rank by 24h quote volume, and take the top `size`. */
export const selectUniverse = (
  pairs: readonly PairInfo[],
  options: UniverseOptions = DEFAULT_UNIVERSE,
): PairInfo[] => {
  const quotes = new Set(options.quotes.map((q) => q.toUpperCase()));
  return pairs
    .filter(
      (p) =>
        quotes.has(p.quote) &&
        !isLeveraged(p.base) &&
        !isStableToStable(p) &&
        Number.isFinite(p.quoteVolume24h) &&
        p.quoteVolume24h > 0,
    )
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, options.size);
};

/**
 * §8.1: the pair list is cached for an hour. One process-wide cache is enough
 * for a personal, single-user app — there is nothing to invalidate across
 * instances, and a cold instance just pays one extra request.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

interface PairSource {
  listPairs: () => Promise<PairInfo[]>;
}

let cache: { at: number; pairs: PairInfo[] } | undefined;

/** Every tradable pair the provider lists, cached. Unfiltered. */
export const loadPairs = async (
  adapter: PairSource,
  now: number = Date.now(),
): Promise<PairInfo[]> => {
  if (cache !== undefined && now - cache.at < CACHE_TTL_MS) return cache.pairs;
  const pairs = await adapter.listPairs();
  cache = { at: now, pairs };
  return pairs;
};

/** The pairs a scan should actually walk: filtered, ranked, capped. */
export const getUniverse = async (
  adapter: PairSource,
  options: UniverseOptions = readUniverseOptions(),
  now: number = Date.now(),
): Promise<PairInfo[]> =>
  selectUniverse(await loadPairs(adapter, now), options);

export const resetUniverseCache = (): void => {
  cache = undefined;
};

/**
 * §8.4 / §13.2: is this symbol one the provider actually lists?
 *
 * Returns `undefined` when the list cannot be loaded, so a caller can tell
 * "not listed" from "could not check" and decide for itself. The symbol regex
 * is what prevents SSRF; this is the second layer, and it should not take the
 * app down when the tickers endpoint hiccups.
 */
export const isKnownSymbol = async (
  adapter: PairSource,
  symbol: string,
): Promise<boolean | undefined> => {
  try {
    const pairs = await loadPairs(adapter);
    return pairs.some((p) => p.symbol === symbol);
  } catch {
    return undefined;
  }
};
