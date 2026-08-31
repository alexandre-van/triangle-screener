# Project rules

Read `PLAN.md` for the full spec, then `docs/decisions.md` for the decisions
already made. This file is the short list of rules that apply to every session.

## Where the project is

Phases 0-5 are done and deployed to https://triangle-screener.vercel.app.
The data layer (OKX + Bybit adapters, Zod, resampling) and the pattern engine
(pivots, §6.2b selection, pole, trendlines, scoring) are built and tested;
`/api/klines` returns candles plus any detected patterns. Both fixtures pass
with all six pivots exact. The chart renders candles, both trendlines with
dashed projection, labelled pivot markers and the pole band; pair and
timeframe come from the URL.
**Next task: Phase 6** — security headers and the nonce CSP, rate limiting on
`/api/scan`, and the remaining §13 items. Phase 8's live-data threshold tuning
is worth starting alongside it.

`.env.example` is not committed — this environment refuses to write `.env*`;
create it from the table in `README.md`.

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

## Pattern-engine invariants settled on 2026-09-01

- The high-pivot score's ideal is a **flat resistance** (step 0), not the
  centre of the allowed band. Centring scores a textbook ascending triangle
  1.5/25 and makes §11's "perfect scores ≥ 95" unreachable.
- An **absent pole scores neutrally** (7.5), not 0 — defined as what a pole on
  `minPoleRatio` earns, so the component is continuous. Scoring 0 leaves a
  pattern better off with a barely-qualifying pole than with none.
- Pivot prominence uses the **smaller** adjacent drop, as topographic
  prominence does.
- Decline size takes **magnitudes before the log**: the mirror negates prices
  and `log` of a negative is NaN.
- Neither scoring change loosened a gate. Both fixtures were detected exactly
  before them; only the grading of admitted patterns changed.

## Things that are easy to get wrong here

- `lightweight-charts` will not resize itself. Wire a `ResizeObserver` and call
  `applyOptions({ width, height })`.
- It also sets an **explicit pixel width on its own DOM**, so a grid or flex
  track that sizes to content can never shrink below the width the chart was
  created at. The container then never changes size, the `ResizeObserver`
  never fires, and the chart looks like it is ignoring the viewport. Every
  track holding a chart needs `minmax(0, ...)` and every ancestor `min-w-0`.
- Draw each trendline between **its own** touch points. Spanning it from the
  pattern's first pivot sends resistance off the top of the chart on any
  descending pattern, where the first pivot is a low.
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
- **Concurrency is not a rate.** Eight workers at 100ms each is 80 requests a
  second; OKX allows 40 per 2s. Everything goes through the pacer in
  `src/lib/exchange/rateLimit.ts`. Before it existed, a scan silently
  rate-limited 135 of 200 pairs and still looked like it worked.
- A scan fetches 300 candles per pair, the chart 1000. OKX caps a request at
  300, so the chart's history costs four requests where the scan's costs one.
- `pnpm e2e` builds first. Playwright's `webServer` serves whatever is in
  `.next`, so without it you test the previous build — and a test can pass
  against an attribute that does not exist yet.
- E2E runs one worker: every spec scans the whole universe through one pacer.
