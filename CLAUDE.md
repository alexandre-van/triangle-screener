# Project rules

Read `PLAN.md` for the full spec, then `docs/decisions.md` for the decisions
already made. This file is the short list of rules that apply to every session.

## Where the project is

Phases 0, 1 and 2 are done. Next.js 16 + Tailwind v4 with the §9 palette, the
full CI pipeline, and the data layer: `ExchangeAdapter`, OKX and Bybit
adapters, Zod schemas on every response, resampling, and `/api/klines`.
`src/app/page.tsx` is still a placeholder shell.
**Next task: Phase 3** — pivot detection, the triangle detector, scoring, and
the two fixtures passing. Budget more time for it than §15 suggests.

Still outstanding, and only you can do it: connect the repo to Vercel and set
the function region. `.env.example` is not committed — this environment refuses
to write `.env*`; create it from the table in `README.md`.

`docs/fixtures/` holds the two calibration series, verified against §6.3.
Rebuild them with `node scripts/build-fixtures.mjs` (no dependencies, needs
network). Do not hand-edit them.

## Workflow

- Never commit directly to `main`. Branch, PR, let CI pass, squash merge.
- One phase from `PLAN.md` per PR where possible. Small PRs.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`.
- Run `pnpm lint && pnpm typecheck && pnpm test` before opening a PR. Do not
  push and hope CI tells you.
- When you change a threshold in `src/lib/patterns/config.ts`, say why in
  `docs/decisions.md` in the same commit.

## Code

- TypeScript `strict`. No `any`. No non-null assertions (`!`) — narrow properly.
- Everything in `src/lib/patterns/` is pure: no `fetch`, no `Date.now()`, no
  randomness, no logging. It takes candles in and returns patterns out.
- All exchange responses go through a Zod schema before use.
- Exchange calls happen server-side only, inside route handlers. The browser
  never talks to an exchange.
- Drop the currently-forming candle before running detection. Patterns must not
  repaint.
- Use wick extremes (`high`, `low`) for pivots, never `close`.
- No new colours. The palette is four hex values plus amber alpha overlays; see
  `PLAN.md` §9.

## Testing

- The pattern engine needs 90% coverage. Write the test before the fix.
- The Hermès and Boeing fixtures in `docs/fixtures/` are the calibration
  targets. If they fail, tune `config.ts` — never special-case them inside the
  detector.
- Yahoo emits placeholder rows on exchange holidays (zero volume, `o=h=l` set to
  junk, close carried over). `scripts/build-fixtures.mjs` drops them. Any future
  data loader needs the same guard, or weekly bars get false lows.
- If a change makes a fixture pass but you had to loosen a threshold to do it,
  say so explicitly in the PR description.

## Pattern-engine invariants settled on 2026-08-31

Each of these was verified against the Hermès and Boeing fixtures. Re-read the
matching entry in `docs/decisions.md` before changing any of them.

- The six pivots are **the endpoints of the three largest non-overlapping
  declines** in the window (`PLAN.md` §6.2b). They are *not* six consecutive
  swings — that rule was wrong and made both fixtures undetectable.
- Move sizes are compared in **log price**. In absolute terms a long history
  ranks every recent wiggle above the pattern you are looking for.
- **The pole decides `direction`, not the trendline slopes.** `subtype:
  'symmetrical'` is a shape tag and never overrides direction. Boeing is
  descending.
- The pole needs `minPoleBars` (10). Without a minimum length Boeing finds a
  4-bar pole and gets labelled ascending.
- Pole cleanliness is a drawdown from the **running** high. Measured against the
  pole's end instead, it rejects every pole that has ever existed.
- Rule 2's overshoot is **additive** — `h(n) + OVERSHOOT × (h(n) − l(n))`.
  Written multiplicatively it inverts under the mirror, where prices are
  negative.
- `f_low` (rule 3) is a **scoring input, not a gate**. Real triangles sit far
  below the 0.236–0.786 ideal; three of the four fixture values do.
- There is **no apex-distance rule**. `maxApexBars` does not exist.

## Things that are easy to get wrong here

- `lightweight-charts` will not resize itself. Wire a `ResizeObserver` and call
  `applyOptions({ width, height })`.
- The last candle from every exchange is incomplete. Slice it off.
- Descending triangles are detected by mirroring the series and running the
  ascending detector. Do not write a second detector.
- `#CA3C25` fails contrast for small text on the green background. It is for
  candles, lines, and large numerals only.
- **OKX is the provider, not Bybit.** Bybit 403s from any US IP, which is where
  Vercel's default region and every GitHub runner live. See `docs/decisions.md`,
  2026-08-31. Bybit's adapter exists but has never seen a live response.
- OKX bars of **6h and above are Hong Kong-anchored** unless you ask for the
  `utc` variant — `1Dutc`, not `1D`. Eight hours off is easy to miss on a chart
  and fatal to a fixture.
- OKX caps `limit` at **300**. Larger requests page backwards with `after`, and
  the bar on the seam comes back twice.
- Both OKX and Bybit return candles **newest-first**, as **strings**, with
  **millisecond** timestamps. The adapters normalise all three. Nothing
  downstream re-checks.
- Both report business errors inside a **200**. Check `code` / `retCode` before
  validating the payload — an error response has no payload to validate.
- Bybit has no `8h` and no `3d` interval. `3d` and `3M` are resampled. OKX
  serves every timeframe natively.
- Binance returns 451 from Vercel. It is a local-development fallback only; do
  not build anything that assumes it works in production.
- Overrunning Bybit's rate limit earns a 10-minute IP ban. Keep concurrency low.
