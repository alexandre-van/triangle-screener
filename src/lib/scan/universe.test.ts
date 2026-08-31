import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PairInfo } from "../exchange/types";
import {
  DEFAULT_UNIVERSE,
  isKnownSymbol,
  isLeveraged,
  isStableToStable,
  loadPairs,
  looksLikeStable,
  readUniverseOptions,
  resetUniverseCache,
  selectUniverse,
} from "./universe";

beforeEach(() => resetUniverseCache());

const pair = (
  symbol: string,
  base: string,
  quote: string,
  vol: number,
): PairInfo => ({
  symbol,
  base,
  quote,
  quoteVolume24h: vol,
});

describe("isLeveraged", () => {
  it("catches the multiplier suffixes OKX uses", () => {
    expect(isLeveraged("BTC3L")).toBe(true);
    expect(isLeveraged("ETH3S")).toBe(true);
    expect(isLeveraged("SOL5L")).toBe(true);
  });

  it("catches the UP/DOWN/BULL/BEAR family other venues use", () => {
    for (const b of ["BTCUP", "BTCDOWN", "ETHBULL", "ETHBEAR", "BTCHEDGE"]) {
      expect(isLeveraged(b), b).toBe(true);
    }
  });

  it("leaves ordinary tickers alone", () => {
    for (const b of ["BTC", "ETH", "SOL", "DOGE", "LINK", "UNI"]) {
      expect(isLeveraged(b), b).toBe(false);
    }
  });
});

describe("isStableToStable", () => {
  it("rejects a pair of two stable units", () => {
    expect(isStableToStable(pair("USDCUSDT", "USDC", "USDT", 1))).toBe(true);
    expect(isStableToStable(pair("DAIUSDT", "DAI", "USDT", 1))).toBe(true);
  });

  it("rejects fiat against a stablecoin", () => {
    // USDT/TRY ranked third by volume on OKX when the adapter was first run.
    expect(isStableToStable(pair("USDTTRY", "USDT", "TRY", 1))).toBe(true);
  });

  it("keeps a real asset against a stablecoin", () => {
    expect(isStableToStable(pair("BTCUSDT", "BTC", "USDT", 1))).toBe(false);
  });

  it("catches a stablecoin the hardcoded list has never heard of", () => {
    // USDG shipped, ranked into the top 200 and scored 66.2 on the first live
    // scan. The naming convention is what generalises, not the list.
    expect(isStableToStable(pair("USDGUSDT", "USDG", "USDT", 1))).toBe(true);
  });
});

describe("looksLikeStable", () => {
  it("matches the dollar and euro naming conventions", () => {
    for (const t of ["USDT", "USDC", "USDG", "USDE", "USD0", "USDS", "EURC"]) {
      expect(looksLikeStable(t), t).toBe(true);
    }
  });

  it("matches tokens that put the unit last", () => {
    for (const t of ["PYUSD", "FDUSD", "RLUSD", "LUSD", "CRVUSD"]) {
      expect(looksLikeStable(t), t).toBe(true);
    }
  });

  it("leaves ordinary tickers alone", () => {
    for (const t of ["BTC", "ETH", "SOL", "USELESS", "EURO3", "USUAL"]) {
      expect(looksLikeStable(t), t).toBe(false);
    }
  });
});

describe("selectUniverse", () => {
  const pairs = [
    pair("BTCUSDT", "BTC", "USDT", 900),
    pair("ETHUSDT", "ETH", "USDT", 800),
    pair("USDCUSDT", "USDC", "USDT", 5000), // stable-to-stable, huge volume
    pair("BTC3LUSDT", "BTC3L", "USDT", 700), // leveraged
    pair("SOLUSDC", "SOL", "USDC", 600), // wrong quote
    pair("DOGEUSDT", "DOGE", "USDT", 500),
    pair("DEADUSDT", "DEAD", "USDT", 0), // no volume
  ];

  it("ranks by 24h quote volume", () => {
    expect(selectUniverse(pairs).map((p) => p.symbol)).toEqual([
      "BTCUSDT",
      "ETHUSDT",
      "DOGEUSDT",
    ]);
  });

  it("drops the highest-volume pair when it is stable-to-stable", () => {
    // USDCUSDT has 5x the volume of anything else and must still not appear.
    expect(selectUniverse(pairs).map((p) => p.symbol)).not.toContain(
      "USDCUSDT",
    );
  });

  it("honours the size cap", () => {
    expect(selectUniverse(pairs, { quotes: ["USDT"], size: 2 })).toHaveLength(
      2,
    );
  });

  it("can screen more than one quote asset", () => {
    const out = selectUniverse(pairs, { quotes: ["USDT", "USDC"], size: 10 });
    expect(out.map((p) => p.symbol)).toContain("SOLUSDC");
  });

  it("returns nothing rather than throwing on an empty list", () => {
    expect(selectUniverse([])).toEqual([]);
  });
});

describe("readUniverseOptions", () => {
  it("defaults to the top 200 USDT pairs", () => {
    expect(readUniverseOptions({})).toEqual(DEFAULT_UNIVERSE);
  });

  it("parses a comma-separated quote list, upper-cased", () => {
    expect(
      readUniverseOptions({ SCAN_QUOTE_ASSETS: "usdt, usdc" }).quotes,
    ).toEqual(["USDT", "USDC"]);
  });

  it("ignores a size that is not a sane integer", () => {
    for (const v of ["0", "-5", "abc", "9999", "12.5"]) {
      expect(readUniverseOptions({ SCAN_UNIVERSE_SIZE: v }).size, v).toBe(200);
    }
    expect(readUniverseOptions({ SCAN_UNIVERSE_SIZE: "50" }).size).toBe(50);
  });
});

describe("loadPairs and the one-hour cache", () => {
  const pairs = [pair("BTCUSDT", "BTC", "USDT", 900)];

  it("fetches once and serves the cache until it expires", async () => {
    resetUniverseCache();
    const listPairs = vi.fn(async () => pairs);
    const t0 = 1_000_000;

    await loadPairs({ listPairs }, t0);
    await loadPairs({ listPairs }, t0 + 59 * 60_000);
    expect(listPairs).toHaveBeenCalledTimes(1);

    await loadPairs({ listPairs }, t0 + 61 * 60_000);
    expect(listPairs).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure", async () => {
    resetUniverseCache();
    const listPairs = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(loadPairs({ listPairs })).rejects.toThrow();
    await expect(loadPairs({ listPairs })).rejects.toThrow();
    expect(listPairs).toHaveBeenCalledTimes(2);
  });
});

describe("isKnownSymbol", () => {
  it("distinguishes a listed pair from an unlisted one", async () => {
    resetUniverseCache();
    const listPairs = async () => [pair("BTCUSDT", "BTC", "USDT", 1)];
    expect(await isKnownSymbol({ listPairs }, "BTCUSDT")).toBe(true);
    expect(await isKnownSymbol({ listPairs }, "NOPEUSDT")).toBe(false);
  });

  it("answers undefined — not false — when the list cannot be loaded", async () => {
    // A caller must be able to tell "not listed" from "could not check", or a
    // hiccup in the tickers endpoint takes the chart down with it.
    resetUniverseCache();
    const listPairs = async () => {
      throw new Error("down");
    };
    expect(await isKnownSymbol({ listPairs }, "BTCUSDT")).toBeUndefined();
  });

  it("sees pairs a scan would filter out, since it asks what is listed", async () => {
    resetUniverseCache();
    const listPairs = async () => [pair("USDCUSDT", "USDC", "USDT", 1)];
    expect(await isKnownSymbol({ listPairs }, "USDCUSDT")).toBe(true);
  });
});
