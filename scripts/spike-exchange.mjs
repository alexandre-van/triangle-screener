#!/usr/bin/env node
// PLAN.md §4 — data provider spike. Answers one question: which exchanges
// respond from this environment, and what does their payload actually look
// like? Run it locally, from a GitHub Actions runner, and from a Vercel
// function; the three answers differ, which is the entire point.
//
// Writes spike-out/<provider>-<what>.json so the real responses can be
// committed as test fixtures instead of hand-written guesses.
//
// .mjs, not .ts as §3 suggests: this is a throwaway diagnostic that must run
// with a bare `node scripts/spike-exchange.mjs` on any runner, with no build
// step and no dev dependency, exactly like scripts/build-fixtures.mjs.

import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../spike-out/", import.meta.url);
const TIMEOUT_MS = 15_000;

const PROVIDERS = [
  {
    name: "bybit-spot",
    candles:
      "https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=500",
    pairs: "https://api.bybit.com/v5/market/tickers?category=spot",
  },
  {
    name: "bybit-linear",
    candles:
      "https://api.bybit.com/v5/market/kline?category=linear&symbol=BTCUSDT&interval=60&limit=500",
    pairs: "https://api.bybit.com/v5/market/tickers?category=linear",
  },
  {
    name: "binance",
    candles:
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=500",
    pairs: "https://api.binance.com/api/v3/ticker/24hr",
  },
  {
    name: "okx",
    candles:
      "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=300",
    pairs: "https://www.okx.com/api/v5/market/tickers?instType=SPOT",
  },
  {
    name: "kraken",
    candles: "https://api.kraken.com/0/public/OHLC?pair=XBTUSDT&interval=60",
    pairs: "https://api.kraken.com/0/public/Ticker",
  },
];

const fetchJson = async (url) => {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return {
        ok: false,
        status: res.status,
        ms: Date.now() - started,
        error: `non-JSON body: ${text.slice(0, 120)}`,
      };
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: e.cause?.code ?? e.name ?? String(e),
    };
  }
};

/** How many candles came back, whichever shape the provider uses. */
const countCandles = (body) => {
  if (Array.isArray(body)) return body.length; // binance
  if (Array.isArray(body?.result?.list)) return body.result.list.length; // bybit
  if (Array.isArray(body?.data)) return body.data.length; // okx
  const kraken = body?.result && Object.values(body.result).find(Array.isArray);
  return kraken?.length ?? 0;
};

const countPairs = (body) => {
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body?.result?.list)) return body.result.list.length;
  if (Array.isArray(body?.data)) return body.data.length;
  return Object.keys(body?.result ?? {}).length;
};

mkdirSync(OUT, { recursive: true });
const summary = [];

for (const p of PROVIDERS) {
  const candles = await fetchJson(p.candles);
  const pairs = await fetchJson(p.pairs);

  const row = {
    provider: p.name,
    candles: {
      status: candles.status,
      ms: candles.ms,
      count: candles.ok ? countCandles(candles.body) : 0,
      error: candles.error,
    },
    pairs: {
      status: pairs.status,
      ms: pairs.ms,
      count: pairs.ok ? countPairs(pairs.body) : 0,
      error: pairs.error,
    },
  };
  summary.push(row);
  console.log(JSON.stringify(row));

  if (candles.ok) {
    writeFileSync(
      new URL(`${p.name}-candles.json`, OUT),
      JSON.stringify(candles.body, null, 2),
    );
  }
  if (pairs.ok) {
    writeFileSync(
      new URL(`${p.name}-pairs.json`, OUT),
      JSON.stringify(pairs.body, null, 2),
    );
  }
}

writeFileSync(
  new URL("summary.json", OUT),
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      environment: process.env.SPIKE_ENV ?? "unknown",
      results: summary,
    },
    null,
    2,
  ),
);

console.log(`\nwrote spike-out/ (${summary.length} providers)`);
