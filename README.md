# Triangle screener

A personal, free-to-run crypto pair screener that finds ascending and
descending triangles across timeframes from 5 minutes to 3 months, and draws
them on a TradingView-style chart.

`PLAN.md` is the source of truth. `docs/decisions.md` records what has been
settled and why. `CLAUDE.md` is the short list of rules that apply to every
session.

## Status

Phase 1 — scaffold. Next.js, Tailwind with the §9 palette, CI. The chart
(Phase 4) and the screener panel (Phase 5) are placeholders.

## Getting started

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev
```

Nothing is required in `.env.local` for local development — every variable
below has a working default. Create the file when you want to override one.

| Variable                   | Default | What it does                                                                                                                                                     |
| -------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXCHANGE_PROVIDER`        | `bybit` | `bybit` or `binance`. Bybit is the only one that works from Vercel; Binance returns 451 from their edge and is a local-development fallback only (`PLAN.md` §4). |
| `SCAN_QUOTE_ASSETS`        | `USDT`  | Comma-separated quote assets to screen (§8.1).                                                                                                                   |
| `SCAN_UNIVERSE_SIZE`       | `200`   | How many pairs the scanner keeps, ranked by 24h quote volume (§8.1).                                                                                             |
| `UPSTASH_REDIS_REST_URL`   | —       | Phase 6/7 only — rate limiting and pre-computed scans.                                                                                                           |
| `UPSTASH_REDIS_REST_TOKEN` | —       | As above.                                                                                                                                                        |

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

Bybit v5 is the exchange, server-side only — the browser never talks to an
exchange. Binance returns HTTP 451 from Vercel and exists as a local-development
fallback behind `EXCHANGE_PROVIDER`. See `PLAN.md` §4.

`docs/fixtures/` holds two hand-verified weekly series — Hermès (ascending) and
Boeing (descending) — used as regression targets for the detector. Rebuild them
with `node scripts/build-fixtures.mjs`; do not hand-edit.

## Notes

- Scheduled GitHub Actions workflows on a public repo are disabled after 60 days
  of no repo activity. Relevant once the Phase 7 scan cron exists.
