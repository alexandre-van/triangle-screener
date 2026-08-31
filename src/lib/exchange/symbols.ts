import { ExchangeError } from "./types";

/**
 * Quote assets we can split a concatenated symbol on, longest first so that
 * BTCUSDC is not read as BTCUSD + C, and ETHUSDT is not read as ETHUSD + T.
 */
const QUOTES = [
  "USDT",
  "USDC",
  "TUSD",
  "FDUSD",
  "DAI",
  "USD",
  "EUR",
  "BTC",
  "ETH",
];

export interface SymbolParts {
  base: string;
  quote: string;
}

/**
 * 'BTCUSDT' -> { base: 'BTC', quote: 'USDT' }.
 *
 * Exchanges disagree about symbol format — OKX uses 'BTC-USDT', Bybit uses
 * 'BTCUSDT' — so the app stores the concatenated form and each adapter
 * converts. Splitting it back needs a known quote list; there is no rule that
 * recovers the boundary from the string alone.
 */
export const splitSymbol = (symbol: string): SymbolParts => {
  for (const quote of QUOTES) {
    if (symbol.length > quote.length && symbol.endsWith(quote)) {
      return { base: symbol.slice(0, symbol.length - quote.length), quote };
    }
  }
  throw new ExchangeError(
    "bad_response",
    "symbols",
    `cannot split ${symbol} into base and quote`,
  );
};
