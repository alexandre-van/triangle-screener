import { createBybitAdapter, type BybitCategory } from "./bybit";
import { createOkxAdapter, type OkxInstType } from "./okx";
import type { ExchangeAdapter } from "./types";

/**
 * PLAN.md §4, revised by the 2026-08-31 spike. OKX is primary because it is
 * the only candidate that answers from a US IP, which is where both Vercel's
 * default region and GitHub's hosted runners live. Bybit 403s and Binance
 * 451s from there. Bybit remains selectable for a deployment pinned to a
 * region it serves.
 *
 * Never run two providers at once: candle boundaries, volume units and listing
 * histories differ, and a mixed scan produces patterns that exist on no single
 * chart.
 */
export type ProviderName = "okx" | "bybit";

const PROVIDERS: ReadonlySet<string> = new Set<ProviderName>(["okx", "bybit"]);

export interface ExchangeConfig {
  provider: ProviderName;
  /** Spot or derivatives. Answered per provider by its own env var. */
  okxInstType: OkxInstType;
  bybitCategory: BybitCategory;
}

export const DEFAULT_CONFIG: ExchangeConfig = {
  provider: "okx",
  okxInstType: "SPOT",
  bybitCategory: "spot",
};

/** Reads the env without throwing: an unrecognised value falls back to the
 * default rather than taking the whole app down at import time. */
export const readConfig = (
  env: Record<string, string | undefined> = process.env,
): ExchangeConfig => {
  const raw = env.EXCHANGE_PROVIDER?.toLowerCase().trim();
  const provider: ProviderName =
    raw !== undefined && PROVIDERS.has(raw)
      ? (raw as ProviderName)
      : DEFAULT_CONFIG.provider;

  const market = env.EXCHANGE_MARKET?.toLowerCase().trim();
  const perps =
    market === "perp" || market === "perpetual" || market === "swap";

  return {
    provider,
    okxInstType: perps ? "SWAP" : "SPOT",
    bybitCategory: perps ? "linear" : "spot",
  };
};

export const createAdapter = (
  config: ExchangeConfig = readConfig(),
): ExchangeAdapter =>
  config.provider === "bybit"
    ? createBybitAdapter(config.bybitCategory)
    : createOkxAdapter(config.okxInstType);

/** One adapter per process. Adapters are stateless, so this is only about not
 * rebuilding the closure on every request. */
let cached: ExchangeAdapter | undefined;

export const getAdapter = (): ExchangeAdapter => {
  cached ??= createAdapter();
  return cached;
};

/** Test seam — resets the process-wide adapter. */
export const resetAdapter = (): void => {
  cached = undefined;
};
