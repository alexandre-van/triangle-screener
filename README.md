# Triangle screener

A personal, free-to-run crypto pair screener that finds ascending and
descending triangles across timeframes from 5 minutes to 3 months, and draws
them on a TradingView-style chart.

`PLAN.md` is the source of truth. `docs/decisions.md` records what has been
settled and why. `CLAUDE.md` is the short list of rules that apply to every
session.

## Status

Phase 5, deployed at https://triangle-screener.vercel.app. The app works end to
end: the screener streams a scan of the top 200 USDT pairs, and clicking a row
draws that pair's triangle on the chart. Both calibration fixtures pass with
all six pivots exact. Security headers and rate limiting (Phase 6) are next.

## Getting started

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev
```

Nothing is required in `.env.local` for local development — every variable
below has a working default. Create the file when you want to override one.

| Variable                   | Default | What it does                                                                                                                                                                                                   |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXCHANGE_PROVIDER`        | `okx`   | `okx` or `bybit`. OKX is the only candidate that answers from a US IP, which is where Vercel's default region and GitHub's runners live — Bybit 403s there and Binance 451s (`docs/decisions.md`, 2026-08-31). |
| `EXCHANGE_MARKET`          | `spot`  | `spot` or `perp`. Switches OKX to `SWAP` and Bybit to `linear` together.                                                                                                                                       |
| `SCAN_QUOTE_ASSETS`        | `USDT`  | Comma-separated quote assets to screen (§8.1).                                                                                                                                                                 |
| `SCAN_UNIVERSE_SIZE`       | `200`   | How many pairs the scanner keeps, ranked by 24h quote volume (§8.1).                                                                                                                                           |
| `UPSTASH_REDIS_REST_URL`   | —       | Phase 6/7 only — rate limiting and pre-computed scans.                                                                                                                                                         |
| `UPSTASH_REDIS_REST_TOKEN` | —       | As above.                                                                                                                                                                                                      |

| Command                            | What it does                                |
| ---------------------------------- | ------------------------------------------- |
| `pnpm dev`                         | Development server on http://localhost:3000 |
| `pnpm build` / `pnpm start`        | Production build and serve                  |
| `pnpm lint`                        | ESLint                                      |
| `pnpm typecheck`                   | `tsc --noEmit`                              |
| `pnpm test` / `pnpm test:coverage` | Vitest                                      |
| `pnpm e2e`                         | Playwright, against a production build      |
| `pnpm format`                      | Prettier                                    |

Run `pnpm lint && pnpm typecheck && pnpm test` before opening a PR. Do not push
and hope CI tells you.

## Layout

```
src/app/          the single page and the route handlers
src/components/   chart, screener, ui
src/lib/exchange/ adapters, Zod schemas, resampling
src/lib/patterns/ the detector — pure, 90% coverage gate
src/lib/scan/     universe and scan orchestration
docs/fixtures/    committed OHLC used as calibration targets
```

## Data

OKX is the exchange, server-side only — the browser never talks to an exchange.
Bybit returns 403 and Binance 451 from any US IP, which is where Vercel's
default region and GitHub's hosted runners are; Bybit stays available behind
`EXCHANGE_PROVIDER` for a deployment pinned to a region it serves. The spike
that established this is `scripts/spike-exchange.mjs`; its results are in
`docs/decisions.md`.

`docs/fixtures/` holds two hand-verified weekly series — Hermès (ascending) and
Boeing (descending) — used as regression targets for the detector. Rebuild them
with `node scripts/build-fixtures.mjs`; do not hand-edit.

## Notes

- Scheduled GitHub Actions workflows on a public repo are disabled after 60 days
  of no repo activity. Relevant once the Phase 7 scan cron exists.
