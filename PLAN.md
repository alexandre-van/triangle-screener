# Triangle Screener — Implementation Plan

A personal, free-to-run crypto pair screener that finds ascending and descending
triangles across timeframes from 5 minutes to 3 months, and shows them on a
TradingView-style chart.

This document is the source of truth. Work through it phase by phase. Do not
skip Phase 0 — it decides which exchange the whole project talks to.

---

## 0. How to use this plan

- Each phase ends with a **Definition of done**. Do not start the next phase
  until the current one is green in CI.
- One phase = one pull request, ideally. Small PRs, squash merge.
- When something in this plan turns out to be wrong or impossible, update this
  file in the same PR that changes the code, and note it in
  `docs/decisions.md`.
- Anything marked **DECIDE** needs a real answer written into
  `docs/decisions.md` before you build on top of it.

---

## 1. What we are building

A single-page app:

- **Left + centre (2/3 width):** a candlestick chart with the detected triangle
  drawn on it — a resistance line through the highs, a support line through the
  lows, labelled pivot markers (H1, L1, H2, L2, H3, L3), and the pole
  highlighted.
- **Right (1/3 width):** a list of crypto pairs that currently have a triangle
  forming, filtered by timeframe and by pattern direction (ascending, including
  symmetrical, or descending). Clicking a row loads that pair and timeframe into
  the chart on the same page. No navigation, no page reload.

Personal use, single user, no accounts, no login, no database of user data.
Hosted free on Vercel.

### Non-goals

- No trading, order placement, brokerage integration, or portfolio tracking.
- No user accounts, no persistence of user state beyond URL query params and
  `localStorage`.
- No backtesting engine in v1 (leave the pattern engine pure so one can be added
  later).
- No paid data feeds.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | First-class Vercel target, route handlers give us a server-side proxy for exchange calls |
| Package manager | pnpm | Fast, lockfile is deterministic, good CI cache story |
| Styling | Tailwind CSS v4 with CSS custom properties for the palette | Palette lives in one place, see §9 |
| Charting | `lightweight-charts` v5 (TradingView, Apache-2.0) | Exactly the look asked for, free, and v5 series primitives let us draw the trendlines |
| Data fetching (client) | TanStack Query v5 | Caching, background refetch, request dedupe |
| Validation | Zod | Every API input and every exchange response gets parsed, never trusted |
| Unit tests | Vitest | Fast, native ESM/TS |
| E2E tests | Playwright | One smoke test, see §12 |
| Lint/format | ESLint (flat config) + Prettier | |
| Git hooks | Husky + lint-staged | Catch failures before CI |
| Cache/KV (Phase 6) | Upstash Redis (free tier) | Optional, only if pre-computed scanning is added |

**Do not add a UI component library** unless a specific need appears. The UI is
about six components. Hand-write them.

---

## 3. Repository structure

```
.
├── CLAUDE.md                     # standing rules, read every session
├── PLAN.md                       # this file
├── docs/
│   ├── decisions.md              # decision log, append-only
│   ├── pattern-spec.md           # extracted from §7 once stable
│   └── fixtures/                 # committed OHLC CSVs for regression tests
│       ├── rms-weekly.csv        # Hermès, weekly
│       └── ba-weekly.csv         # Boeing, weekly
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # the only page
│   │   ├── globals.css
│   │   └── api/
│   │       ├── klines/route.ts   # GET candles for one pair+timeframe
│   │       └── scan/route.ts     # GET triangle hits for one timeframe
│   ├── components/
│   │   ├── chart/
│   │   │   ├── PriceChart.tsx
│   │   │   ├── TrianglePrimitive.ts   # lightweight-charts series primitive
│   │   │   └── pivotMarkers.ts
│   │   ├── screener/
│   │   │   ├── ScreenerPanel.tsx
│   │   │   ├── TimeframeSelect.tsx
│   │   │   ├── DirectionFilter.tsx
│   │   │   └── PairRow.tsx
│   │   └── ui/                   # Button, Badge, Select, Skeleton, EmptyState
│   ├── lib/
│   │   ├── exchange/
│   │   │   ├── types.ts          # Candle, Timeframe, ExchangeAdapter
│   │   │   ├── adapter.ts        # picks the adapter from env
│   │   │   ├── bybit.ts
│   │   │   ├── binance.ts
│   │   │   └── resample.ts       # 1M -> 3M aggregation
│   │   ├── patterns/
│   │   │   ├── pivots.ts         # swing detection
│   │   │   ├── triangle.ts       # the detector (ascending only)
│   │   │   ├── mirror.ts         # invert a series to reuse the detector
│   │   │   ├── score.ts          # quality scoring
│   │   │   ├── trendline.ts      # line fitting + projection
│   │   │   └── config.ts         # all tunable thresholds, one object
│   │   ├── scan/
│   │   │   ├── universe.ts       # which pairs to scan
│   │   │   └── scanner.ts        # orchestration, concurrency, throttling
│   │   └── format.ts
│   └── types/
├── scripts/
│   └── scan-cron.ts              # Phase 6, run by GitHub Actions
└── .github/
    ├── workflows/
    ├── dependabot.yml
    └── pull_request_template.md
```

---

## 4. Phase 0 — Data provider spike (do this first, it's half a day)

> **ANSWERED 2026-08-31 — and the expected outcome below was wrong.** The spike
> ran from a GitHub Actions runner in Virginia, the same metro as Vercel's
> default `iad1` region. **Bybit returns 403** there — "The Amazon CloudFront
> distribution is configured to block access from your country" — for both
> `spot` and `linear`. Binance returns 451 as predicted. **OKX answers 200**
> with 1385 spot tickers, 395 of them USDT, and is now the primary provider.
> Kraken answers 200 but lists only 47 USDT pairs, so it is not a usable
> fallback for this app. See `docs/decisions.md`. The rest of this section is
> kept because its *reasoning* was right — it just applied to Bybit too.

**Already established, do not re-litigate:** Binance returns HTTP 451
("Restricted access") to requests originating from Vercel. This is reported by
Next.js developers hitting Binance's *public* endpoints — works locally, fails
once deployed. The restriction follows the server's region, not the user's, so
it will pass every test on a laptop in Bali and fail in production.

**Therefore: Bybit v5 is the default.** The spike's job is to confirm Bybit
works from a Vercel function and from a GitHub Actions runner, and to establish
a second fallback — not to re-evaluate Binance as primary.

**Tasks:**

1. Write `scripts/spike-exchange.ts`. For each candidate, fetch 500 candles of
   `BTCUSDT` at `1h` and the full list of tradable pairs:
   - **Bybit v5** — `GET https://api.bybit.com/v5/market/kline` (category
     `spot` or `linear`), `GET /v5/market/tickers` for the universe.
   - **Binance** — `GET https://api.binance.com/api/v3/klines`, and
     `GET /api/v3/ticker/24hr`.
   - **OKX** — `GET https://www.okx.com/api/v5/market/candles`.
   - **Kraken** — `GET https://api.kraken.com/0/public/OHLC`.
2. Deploy a throwaway Vercel preview with a route handler that runs the same
   three fetches, and hit it. **Testing from your laptop is not enough** — the
   laptop is in Bali, the function is not.
3. Also run it from a GitHub Actions job (`workflow_dispatch`) to check the
   runner region.

**Record in `docs/decisions.md`:** which providers responded from which
environment, with dates and status codes. Expected outcome: **Bybit primary,
OKX fallback, Binance kept behind the env var for local use only.**

Never run two providers at once. Candle boundaries, volume units, and listing
histories differ between exchanges; a scan that mixes them produces patterns
that don't exist on any single chart.

**Definition of done:** `ExchangeAdapter` interface exists, two adapters
implement it, a documented env var `EXCHANGE_PROVIDER` switches between them,
and the spike results are written into `docs/decisions.md` with dates.

---

## 5. Data layer

### 5.1 The adapter interface

```ts
// src/lib/exchange/types.ts
export type Timeframe =
  | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '12h'
  | '1d' | '3d' | '1w' | '1M' | '3M';

export interface Candle {
  /** open time, unix seconds, UTC */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PairInfo {
  symbol: string;        // 'BTCUSDT'
  base: string;          // 'BTC'
  quote: string;         // 'USDT'
  quoteVolume24h: number;
}

export interface ExchangeAdapter {
  readonly name: string;
  listPairs(): Promise<PairInfo[]>;
  getCandles(symbol: string, tf: Timeframe, limit: number): Promise<Candle[]>;
}
```

Rules:
- Candles are returned **oldest first**.
- The **last candle is the currently forming one.** Every consumer must be
  explicit about whether it includes it. The pattern engine works on *closed*
  candles only — drop the last one before detection. Repainting patterns are
  worse than no patterns.
- All exchange responses go through a Zod schema. A malformed response throws a
  typed `ExchangeError`, never leaks into the UI as `undefined`.

### 5.2 Timeframes and the provider mappings

**OKX (primary) needs no resampling.** It serves all thirteen timeframes
natively, `3d` and `3M` included. Two things to get right instead:

- Bars of **6H and above are anchored to Hong Kong time (UTC+8)** unless the
  `utc` suffix is used — `1Dutc`, not `1D`. Without it every daily, weekly and
  monthly candle sits eight hours from where TradingView draws it. Timeframes
  below 6H have no variant and need none.
- **`limit` is capped at 300**, so anything larger pages backwards with `after`.
  The bar on the page seam is returned twice and must be deduped.

OKX candles also carry a **`confirm` flag** — `"0"` forming, `"1"` closed —
which states the repaint hazard rather than leaving it to be inferred.

The Bybit mapping below still applies when `EXCHANGE_PROVIDER=bybit`.

Bybit's `interval` parameter accepts exactly:
`1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, W, M`. `limit` is capped at 1000,
default 200.

| Our `Timeframe` | Bybit `interval` | Source |
|---|---|---|
| `5m` | `5` | native |
| `15m` | `15` | native |
| `30m` | `30` | native |
| `1h` | `60` | native |
| `2h` | `120` | native |
| `4h` | `240` | native |
| `6h` | `360` | native |
| `12h` | `720` | native |
| `1d` | `D` | native |
| `3d` | `D` | **resampled**, 3-day groups anchored to a fixed epoch Monday |
| `1w` | `W` | native |
| `1M` | `M` | native |
| `3M` | `M` | **resampled**, calendar quarters |

`resample.ts` handles both gaps: `open` = first open, `close` = last close,
`high` = max, `low` = min, `volume` = sum. Drop an incomplete leading group.
Quarters are Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec — do not use rolling 3-month
windows, they won't match what any charting platform shows.

There is no `8h`; it was dropped from the `Timeframe` union deliberately.

**Two Bybit response quirks that will silently corrupt everything:**

1. **The candle list is sorted newest-first.** Reverse it in the adapter, once,
   and assert ascending `time` in a unit test. Every consumer assumes oldest
   first.
2. Every field is a **string**, including prices and timestamps, and timestamps
   are **milliseconds**. The Zod schema coerces to number and divides the
   timestamp by 1000 before it leaves the adapter.

### 5.3 Candle counts

The detector needs enough history to see six pivots plus a pole.

| Timeframe group | Candles to fetch |
|---|---|
| 5m – 30m | 1000 |
| 1h – 12h | 1000 |
| 1d – 3d | 1000 |
| 1w | 500 (or max available) |
| 1M / 3M | max available |

Many altcoins simply do not have 1000 weekly candles. Handle short series
gracefully: if `candles.length < config.minCandles` (default 120), skip the pair
for that timeframe rather than erroring.

### 5.4 Rate limits and caching

- All exchange calls happen **server-side only**, inside route handlers. The
  browser never talks to an exchange directly. This keeps CSP tight and means we
  can cache.
- Cache candle responses with Next's `unstable_cache` / `revalidate`, keyed on
  `provider:symbol:tf`, with a TTL of roughly one third of the bar interval
  (5m → 60s, 1h → 300s, 1d → 900s, 1w and above → 3600s).
- Bybit's documented public limit is **600 requests per 5-second window per IP**.
  A 200-pair scan is 200 requests, so the limit is not the bottleneck — network
  latency is. Still, throttle: `p-limit` with a cap of 10, and back off on
  `403 "access too frequent"` or `retCode 10006`. Bybit's penalty for
  overrunning is a **10-minute IP ban**, which is far worse than a slow scan, so
  stay well clear of the ceiling.
- Read the provider's rate-limit response headers and retry with exponential
  delay plus jitter. Never retry more than three times.

---

## 6. The pattern engine

This is the heart of the project. It lives in `src/lib/patterns/`, is **pure**
(no fetch, no dates from `Date.now()`, no randomness), and is the most heavily
tested part of the codebase.

### 6.1 The mirror trick

A descending triangle is an ascending triangle on a vertically flipped chart.
**Write the detector once, for ascending only.** To detect descending:

```ts
// src/lib/patterns/mirror.ts
export const mirror = (c: Candle): Candle => ({
  time: c.time,
  open: -c.open,
  close: -c.close,
  high: -c.low,   // note the swap
  low: -c.high,
  volume: c.volume,
});
```

Run the ascending detector on `candles.map(mirror)`, then un-mirror the result:
negate every price, swap the `highs`/`lows` arrays, and relabel H↔L. Any bug
fixed in the ascending path is automatically fixed for descending. Enforce this
with a property test (§12).

### 6.2 Swing pivot detection

`pivots.ts` produces an alternating sequence of confirmed swing highs and lows.

Use a **fractal detector with an ATR prominence filter**:

1. A bar `i` is a candidate swing high if `high[i]` is the maximum of
   `high[i-k .. i+k]`, where `k = config.pivotStrength` (default 3, wider on
   low timeframes — see the per-timeframe overrides below).
2. Confirmation requires `k` bars to its right to exist, so the last `k` bars
   can never contain a confirmed pivot. This is what stops repainting.
3. Filter out pivots whose prominence — the vertical distance to the adjacent
   opposite pivot — is less than `config.minPivotAtr × ATR(14)` at that bar
   (default 1.5). Where there are two adjacent opposite pivots, use the
   **smaller** drop, as topographic prominence does: taking the larger keeps
   every tiny wobble that happens to sit next to a big move.
4. Enforce alternation: if two highs occur with no low between them, keep the
   higher one and drop the other. Same for lows, keeping the lower.

Always use **wick extremes**, `high` and `low`, never `close`. The brief is
explicit: take the highest of the candles for highs, the lowest for lows.

Per-timeframe overrides live in `config.ts`:

```ts
pivotStrength: { '5m': 5, '15m': 4, '30m': 4, default: 3 },
minPivotAtr:   { '5m': 2.0, '15m': 1.8, default: 1.5 },
```

Low timeframes are noisier and need a stronger filter. These are starting
values, tuned in Phase 5.

### 6.2b Selecting the six pivots

§6.2 produces every confirmed swing in the series. A triangle spanning years
contains dozens of them, so the detector must **choose** six, not walk six
consecutive ones. The six chosen must be the most significant turning points in
the window, so the resulting triangle encloses all of the price action it spans.

**The unit of selection is the move, not the pivot, and each move is used once.**
An ascending triangle is three declines: `H1→L1`, `H2→L2`, `H3→L3`. Those three
declines never overlap in time. So the rule is:

> Take the three largest non-overlapping declines in the window. Their six
> endpoints are the six pivots.

A move that has already supplied a high and a low is spent — it cannot also
supply a pivot for the next pair. That constraint is what makes the selection
stable, and it is the whole of the rule.

**Definitions.** A *clean decline* runs `a → b` where `high[a]` is the maximum
over `[a, b]` and `low[b]` is the minimum over `[a, b]`. Its size is measured in
**log price**: `|log(|high[a]|) − log(|low[b]|)|`. The magnitudes are taken
first because §6.1 mirrors by negating prices, and `log` of a negative number
is NaN — the same hazard as rule 2's additive overshoot. Enumerate every clean decline in
the window, sort by size, and greedily keep the largest that does not overlap
in time with one already kept, until three are held.

Log, not absolute: over a long history a stock can multiply tenfold, and
absolute size then ranks every recent wiggle above every early swing. Ranked in
euros, the six Hermès pivots come 219th to 320th over the full series, because
the stock went from €40 to €2500. Ranked in logs they come first.

Two properties fall out for free, and both are worth a test:

- **Alternation is automatic.** Three disjoint `H→L` moves, sorted by time, give
  `H, L, H, L, H, L` by construction. No alternation pass is needed.
- **Descending needs nothing new.** Run the same code on the mirrored series
  (§6.1) and clean declines become clean rallies.

**Verified against both fixtures.** Exact recovery — all six pivots, no extras —
on Hermès and on Boeing, at every window padding tried from 0 to 100 bars:

| | selected moves (log size) |
|---|---|
| Hermès | 0.649, 0.587, 0.281 |
| Boeing (mirrored) | 1.141, 0.862, 0.680 |

**Window scanning.** The result still depends on the window: given the whole
25-year Hermès series the three biggest declines are elsewhere in the history,
which is correct behaviour. But the tolerance is wide — Hermès spans 213 bars
and survives 395 extra bars before and 130 after; Boeing spans 306 bars and
survives 135 before and 395 after. A coarse sweep of window lengths is enough;
there is no need to search bar by bar.

**Forming patterns** (§6.3 rule 6) use the same rule with two declines instead
of three, giving `H1, L1, H2, L2`.

`config.candidatePoolSize` is not needed and is not introduced — this selects
exactly six.

### 6.3 Ascending triangle definition

Given the alternating pivot sequence, look for a window matching
`H1 → L1 → H2 → L2 [→ H3 → L3]` in strict time order.

Write `h1` for the price of pivot H1, `l1` for L1, and so on.

**Hard constraints (a candidate failing any of these is rejected):**

1. **Ordering.** `t(H1) < t(L1) < t(H2) < t(L2) < t(H3) < t(L3)`. The pivots
   need **not** be consecutive in the raw swing sequence. They are the endpoints
   of the three largest non-overlapping declines in the window (§6.2b), so the
   triangle encloses the whole of the price action it spans rather than one
   small corner of it.

2. **Highs step down, but only slightly.** For each `n`:
   ```
   h(n+1) ∈ [ h(n) − FIB_HIGH_MAX × (h(n) − l(n)),
              h(n) + OVERSHOOT   × (h(n) − l(n)) ]
   ```
   with the overshoot expressed **additively, in units of the leg's own range**.
   It must not be written `h(n) × (1 + OVERSHOOT)`: the mirror (§6.1) negates
   prices, and multiplying a negative price by `1.005` moves it *down*, so a
   multiplicative tolerance silently inverts for every descending pattern. The
   §12 mirror property test exists to catch exactly this.
   with `FIB_HIGH_MAX = 0.316` and `OVERSHOOT = 0.005`. In words: H2 sits in
   the top 31.6% of the H1→L1 range, so it is much closer to H1 than to L1.
   The small overshoot tolerance allows a marginal higher high, which happens
   constantly in real markets and should not disqualify an otherwise clean
   pattern.

3. **Lows retrace the up-leg, ideally back to the middle.** For each `n`:
   ```
   f_low(n) = ( l(n) − l(n−1) ) / ( h(n) − l(n−1) )
   ```
   `f_low` measures how far `L(n)` has pulled back into the `L(n−1)→H(n)` leg
   it just closed: `0` means it fell all the way back to the prior low, `1`
   means no pullback at all.

   **This is a scoring input, not a hard filter.** The only hard requirement is
   `f_low(n) ∈ (FIB_LOW_FLOOR, FIB_LOW_CEIL)` with `FIB_LOW_FLOOR = 0.0` and
   `FIB_LOW_CEIL = 0.95` — the low must genuinely be above the previous low, so
   support is rising, and must not sit so close to the high that no pullback
   happened at all.

   The `0.236 – 0.786` band is the **ideal**, not the admission criterion.
   Score peaks at `f_low(n) = 0.5` and falls off toward either side; drifting
   toward the low side (closer to the prior low) costs much less quality than
   drifting toward the high side. Real examples sit far lower than the ideal —
   the two fixtures measure 0.031, 0.407, 0.067 and 0.095 — so the falloff on
   the low side must be gentle enough that a near-flat support still scores
   respectably.

   Note this is measured against the leg the low **just closed**
   (`L1→H2` for L2, `L2→H3` for L3), not against an older range — each low
   has to sit on a leg it's actually part of.

4. **Convergence.** The resistance line through the highs must have slope ≤ 0
   (allow a tiny positive slope, `≤ +0.05 × ATR per bar`, for symmetrical
   cases). The support line through the lows must have slope > 0. That is the
   whole of the convergence test.

   **There is no apex-distance rule.** `maxApexBars` is removed. Do not compute
   the apex as a filter — a large, slow triangle can point years into the
   future and still be the pattern we want (Boeing's apex is 486 bars past L3).
   The apex is still computed for *drawing* the lines forward, and still feeds
   the geometry component of the score, but it never rejects a candidate.

5. **Meaningful size.** `h1 − l1 ≥ config.minHeightAtr × ATR(14)` at H1,
   default 4. Filters out chop.

6. **Formation gate.** **H3 must be confirmed.** A candidate that stops at L2
   is a shape that has not yet held its resistance a third time, and reporting
   it hands the reader a forecast rather than a pattern — the point of the
   screener is to catch a triangle whose next low is the thing worth watching
   for. L3 is optional; if present it must satisfy rule 3.

   Under the §6.1 mirror this inverts for free: a descending pattern is
   reported once its third **low** is confirmed, waiting on H3.

7. **Not already broken.** Reject if any *closed* candle after L2 has a
   `low` more than `config.breakdownTol` (default 0.5%) below the support line
   at that bar. That's a failed pattern, not a forming one.

**Direction is decided by the pole, not by the slopes.** Both readings of a
series — as-is and mirrored — can yield a geometrically valid triangle. The one
that wins is the one whose **pole** (§6.4) qualifies: the impulse leading into
the pattern tells you which way it is leaning. A triangle preceded by a long
clean decline is descending, whatever its two trendlines happen to be doing.

Boeing is the case in point. Its lows rise 89 → 113 → 129 while its highs fall
279 → 268 → 254, so on slopes alone it reads `symmetrical`. But it is preceded
by a 55-bar decline from 446 to 89 with only a 13% pullback — an unmistakable
descending pole — so it is a **descending** triangle. See `docs/decisions.md`.

**Symmetrical triangles.** `subtype: 'symmetrical'` is a *shape* tag only and
never overrides `direction`. Tag it when the absolute resistance slope exceeds
half the support slope, and relax `FIB_HIGH_MAX` to 0.50 for these. The
direction filter labelled "Ascending (+ symmetrical)" includes both subtypes of
ascending; a symmetrical-shaped pattern with a descending pole belongs under
Descending.

### 6.4 The pole

For an ascending triangle, the pole is the bullish impulse into H1.

Search backwards from H1 over at most `config.maxPoleBars` (default 60), and at
least `config.minPoleBars` (default 10), for the start bar `P` that maximises
the ratio below. The pole qualifies if:

```
h1 − low(P) ≥ config.minPoleRatio × (h1 − l1)      // default 1.0
```

and the run-up is clean: **no pullback from the running high exceeds 40% of the
pole's height.**

Both of those conditions matter, and the second must be measured against the
**running** high, not against `h1`. "No low between `P` and `H1` is more than
40% of the way back down the pole" — the obvious reading — rejects every pole
ever formed, because the bars just after `P` are by definition still near the
bottom. Measured correctly, Boeing's descending pole shows a 13% worst pullback
and Hermès's ascending pole 39%.

`minPoleBars` is what makes §6.3's direction test work. Without it, Boeing finds
a 4-bar "pole" in the ascending reading scoring 1.43 — noise off the COVID low —
which beats the real 55-bar descending pole at 1.41 and flips the label. At
`minPoleBars ≥ 5` the spurious pole disappears and descending wins cleanly at
every value tried up to 20.

The pole is **not required** — the brief says triangles can be reversal patterns
too. It contributes to the score.

### 6.5 Timing rules

Measured in **bars**, not wall-clock:

```
t1 = index(H1) − index(P)     // up   (pole)
t2 = index(L1) − index(H1)    // down
t3 = index(H2) − index(L1)    // up
t4 = index(L2) − index(H2)    // down
t5 = index(H3) − index(L2)    // up
t6 = index(L3) − index(H3)    // down
```

Ideal: `t1 < t2`, `t3 < t4`, `t5 < t6` — the up legs are quicker than the down
legs, which is what "more power to the upside" looks like on a chart.

**These are scoring inputs, not hard filters.** The brief's own Hermès example
has `t6 < t5` and is still described as acceptable. Do not reject on timing.

### 6.6 Trendlines

`trendline.ts` fits and projects the two lines.

- With two pivots: the line through them.
- With three: **least-squares fit** through the three points, then translate the
  line vertically so it touches the most extreme point without cutting through
  it — resistance sits at or above every high, support at or below every low.
  Report `fitError` as the root-mean-square residual before translation,
  normalised by ATR. Low error means clean touches, which scores well.
- Expose `valueAt(barIndex)` for projection, used for the breakout check and for
  drawing the lines forward to the apex.

### 6.7 Status

```ts
type TriangleStatus =
  | 'h3_formed'        // H3 confirmed, waiting on L3 — the earliest reported
  | 'complete'         // L3 confirmed, watching for breakout above H3 line
  | 'breakout';        // a closed candle closed above the resistance line
```

There is no `forming` state. Four pivots is not yet a pattern; see §6.3 rule 6.

Invalidated patterns are dropped, not surfaced.

### 6.8 Quality score

`score.ts` returns 0–100:

| Component | Points | How |
|---|---|---|
| High-pivot Fibonacci fit | 25 | For each high-step, distance of the actual ratio from the ideal (centre of the allowed band). Averaged. |
| Low-pivot Fibonacci fit | 25 | Distance of each `f_low(n)` from 0.5, the ideal half-retracement. Averaged. Asymmetric falloff: drift toward the high edge is penalised steeply, drift toward the low edge gently — a near-flat support (`f_low ≈ 0.05`) is common in real triangles and must still score around half marks, or both fixtures fail. |
| Timing | 15 | 5 points per satisfied rule (`t1<t2`, `t3<t4`, `t5<t6`). Rules involving pivots that don't exist yet are scored pro-rata over the rules that do apply. |
| Pole | 15 | 0 if absent; scaled by `(h1 − low(P)) / (h1 − l1)`, capped at 15 when the ratio reaches 2.0. |
| Geometry | 10 | Line `fitError` (lower is better) and apex position — best when the last candle sits 50–85% of the way from H1 to the apex. |
| Completeness | 10 | +5 for H3 confirmed, +5 for L3 confirmed. |

**High quality badge** when `score ≥ 75` **and** all applicable timing rules
pass. Show the numeric score in a tooltip on the badge.

### 6.9 Output type

```ts
export interface TrianglePattern {
  symbol: string;
  timeframe: Timeframe;
  direction: 'ascending' | 'descending';
  subtype: 'classic' | 'symmetrical';
  status: TriangleStatus;
  score: number;                // 0-100
  highQuality: boolean;
  pivots: {
    pole?: { index: number; time: number; price: number };
    h1: Pivot; l1: Pivot; h2: Pivot; l2: Pivot;
    h3?: Pivot; l3?: Pivot;    // labels are pre-mirrored for descending
  };
  resistance: LineSpec;         // { slope, intercept, anchorBarIndex }
  support: LineSpec;
  apexBarIndex: number;
  breakoutLevel: number;        // resistance value at the current bar
  timings: { t1?: number; t2: number; t3: number; t4: number; t5?: number; t6?: number };
  detectedAtBarTime: number;    // close time of the last closed candle used
}
```

For descending patterns the pivot keys stay semantically correct after
un-mirroring: `l1` is the first pivot chronologically, then `h1`, `l2`, `h2`,
`l3`, `h3` — matching the brief's Boeing example.

### 6.10 Multiple candidates

A single pair/timeframe can produce several overlapping candidates. Keep the
**highest-scoring** one per pair per timeframe per direction. Two candidates
overlap if they share three or more pivots.

---

## 7. Regression fixtures

The brief gives two hand-verified examples. They become the calibration
targets.

**Hermès (RMS), weekly, ascending:**
H1 2000-11-06, L1 2001-09-17, H2 2001-12-03, L2 2003-03-10, H3 2004-04-05,
L3 2004-12-06.

**Boeing (BA), weekly, descending:**
L1 2020-03-16, H1 2021-03-15, L2 2022-06-13, H2 2023-12-18, L3 2025-04-07,
H3 2026-01-26.

Tasks:

1. ~~Export weekly OHLC for both and commit to `docs/fixtures/`.~~ **Done.**
   Both CSVs are committed. Rebuild with `node scripts/build-fixtures.mjs`
   (Yahoo daily bars, resampled locally to Monday weeks). Stooq, suggested here
   originally, now sits behind a JavaScript proof-of-work challenge and is no
   longer a keyless CSV endpoint. These are equities, not crypto — that's fine,
   the detector is asset-agnostic. The CSVs are committed so tests never need
   network.
2. Write `triangle.fixtures.test.ts` asserting the detector finds a pattern
   whose pivot dates match the given dates **within ±1 bar**, and that both
   score ≥ 70.
3. **If they don't match, tune the thresholds in `config.ts` — never
   special-case the fixtures in the detector.** Record every threshold change
   and the reasoning in `docs/decisions.md`.

**Both fixtures are already committed and verified** (see `docs/decisions.md`,
2026-08-31). Measured values to calibrate against:

| | high-steps (limit 0.316) | `f_low` | height / ATR | resistance slope | support slope |
|---|---|---|---|---|---|
| Hermès | 0.073, 0.118 | 0.031, 0.407 | 6.48 | −0.030 | +0.065 |
| Boeing (mirrored) | 0.127, 0.103 | 0.067, 0.095 | 5.75 | −0.149 | +0.094 |

All twelve pivot dates in the brief are genuine wick extremes and are found by
§6.2 at `pivotStrength` 3, 4 and 5. Note Boeing classifies as `symmetrical`
under §6.3, not classic descending: its lows rise 89 → 113 → 129 while its
highs fall 279 → 268 → 254.
4. If a rule genuinely cannot accommodate both examples, say so explicitly in
   the PR description rather than quietly loosening everything until they pass.

---

## 8. Scanner and API

### 8.1 Universe

`universe.ts` picks which pairs to scan:

- Quote asset `USDT` by default (env-configurable to add `USDC`, `BTC`).
- Exclude leveraged tokens (`UP`, `DOWN`, `BULL`, `BEAR` suffixes) and stable-to-
  stable pairs.
- Rank by 24h quote volume, keep the top `SCAN_UNIVERSE_SIZE` (default 200).
- Cache the list for one hour.

### 8.2 Scan orchestration

`GET /api/scan?tf=4h&direction=ascending&quality=all`

1. Resolve the universe.
2. Fetch candles for each pair at `tf`, concurrency-limited.
3. Drop the forming candle, run the detector both ways.
4. Filter by `direction`, sort by `score` descending, cap at 100 results.
5. Return `{ scannedAt, timeframe, provider, count, results: TrianglePattern[] }`.

A cold 200-pair scan takes roughly 25–60 seconds depending on provider limits.
That is too slow for a request/response cycle on Vercel.

**MVP approach (Phase 5):** stream progress. The route handler returns a
`ReadableStream` of newline-delimited JSON — one object per pair as it
completes. The right-hand panel fills in progressively with a live "142 / 200"
counter. This feels fast, needs no infrastructure, and stays within the
function timeout because we're streaming, not buffering.

**Later (Phase 6, optional):** a GitHub Actions cron runs `scripts/scan-cron.ts`
and writes results to Upstash Redis; the route handler reads the cached blob and
returns instantly. Notes on that path:
- Vercel Hobby cron is limited to once per day, so **use GitHub Actions, not
  Vercel Cron**.
- Actions minutes are unlimited on public repos, metered on private. There are
  no secrets in this repo, so a public repo is reasonable — **DECIDE**.
- Scheduled workflows on public repos are disabled after 60 days of no repo
  activity. Note it in the README.
- Suggested cadence: every 15 min for `5m`–`1h`, hourly for `2h`–`1d`, daily for
  `3d` and above.

### 8.3 Candles endpoint

`GET /api/klines?symbol=BTCUSDT&tf=4h`

Returns candles plus the detected pattern for that exact pair/timeframe, so
clicking a row is a single round trip. Cached per §5.4.

### 8.4 API rules

- Zod-validate every query parameter. Unknown timeframe, unknown symbol format,
  or out-of-range limits → `400` with a typed error body, never a 500.
- Symbols are validated against `/^[A-Z0-9]{2,20}$/` and checked against the
  cached universe before being interpolated into an upstream URL.
- Every response carries explicit `Cache-Control`.
- Errors are shaped `{ error: { code, message } }` and never include the
  upstream URL or stack trace in production.

---

## 9. Design system

The brief fixes the palette. Follow it exactly.

```css
:root {
  --bg:          #0A2503;   /* deep green, the field */
  --surface:     #1D1A05;   /* panel and row backgrounds */
  --text:        #E6AA68;   /* amber, primary text */
  --accent:      #CA3C25;   /* red, bearish and alerts */

  --text-muted:  rgb(230 170 104 / 0.62);
  --text-faint:  rgb(230 170 104 / 0.38);
  --border:      rgb(230 170 104 / 0.16);
  --border-strong: rgb(230 170 104 / 0.30);
  --elevate:     rgb(230 170 104 / 0.05);  /* hover/selected wash */
}
```

**Contrast, measured:** `#E6AA68` on `#0A2503` is 8.1:1 — comfortable for body
text. `#CA3C25` on `#0A2503` is only 3.3:1 — **never use the red for body text
or small labels.** It is for candle bodies, the descending trendline, the
descending-direction pill, and 18px+ numerals only. When red needs to carry
meaning at small sizes, pair it with a shape or an icon, not colour alone.

Do not introduce new hues. Depth comes from the amber alpha overlays above, not
from new colours.

**Chart tokens:**

| Element | Colour |
|---|---|
| Bullish candle | `--text` (#E6AA68) |
| Bearish candle | `--accent` (#CA3C25) |
| Wicks | same as body, 70% alpha |
| Grid | `rgb(230 170 104 / 0.07)` |
| Crosshair | `--text-muted`, dashed |
| Resistance line | `--accent`, 2px, dashed once projected past the last pivot |
| Support line | `--text`, 2px, same dashing rule |
| Pole highlight | `rgb(230 170 104 / 0.10)` vertical band |
| Pivot markers | small filled circles in `--text`, labels H1…L3 in `--text-muted` |

### Typography

The palette — amber on deep green with a red alarm colour — already reads like
an instrument panel. Lean into that rather than fighting it.

- **Interface and labels:** Instrument Sans (Google Fonts). Slightly narrow,
  warm, holds up at 12–13px which is where most of this UI lives.
- **All numerals:** IBM Plex Mono, and set `font-variant-numeric: tabular-nums`
  everywhere a price, percentage, or countdown appears. Prices in a scrolling
  list must align on the decimal — that is a functional requirement, not a
  stylistic one.
- Type scale: 11 / 12 / 13 / 15 / 20 / 28px. Nothing bigger; there is no hero
  here, the chart is the hero.
- **Sentence case throughout. No ALL-CAPS eyebrow labels.** No decorative
  arrows appended to buttons.
- Row density in the screener: 44px tall on desktop, 52px on touch.

### Copy

Plain and specific. The empty state says "No triangles forming on 4h right now.
Try a higher timeframe or switch to descending." — not "No results found." The
error state says what failed and what to do: "Couldn't reach Bybit. Retrying in
10s." Buttons name their action: "Rescan", not "Submit".

### Motion

One orchestrated moment only: rows appear in the screener as the scan streams
in, with a 120ms fade. Everything else is instant. Respect
`prefers-reduced-motion` by disabling the fade entirely.

---

## 10. Layout and responsiveness

```
Desktop  ≥1280px                        Tablet 768–1279px
┌──────────────────────────────┬──────┐ ┌────────────────────┐
│                              │ tf   │ │ ▸ BTCUSDT · 4h     │  sticky header
│                              │ dir  │ ├────────────────────┤
│         chart                │──────┤ │                    │
│         (2/3)                │ pair │ │      chart         │
│                              │ pair │ │      (55vh)        │
│                              │ pair │ ├────────────────────┤
│                              │ ...  │ │ tf | dir           │
├──────────────────────────────┤      │ │ pair               │
│ symbol · tf · score · badge  │      │ │ pair               │
└──────────────────────────────┴──────┘ └────────────────────┘

Mobile <768px: two tabs — Chart | Screener. Selecting a pair in
Screener switches to Chart automatically and shows a back affordance.
```

- Use CSS Grid: `grid-template-columns: 2fr 1fr` above 1280px.
- The screener list is virtualised only if it exceeds 100 rows — otherwise plain
  DOM. Do not reach for a virtualisation library prematurely.
- Chart resizes via `ResizeObserver` on the container; `lightweight-charts`
  needs an explicit `applyOptions({ width, height })` call, it does not do this
  itself.
- Selected pair and timeframe live in the URL (`?symbol=BTCUSDT&tf=4h&dir=asc`)
  so a chart view is linkable and survives a refresh.
- Keyboard: `↑`/`↓` move through the list, `Enter` loads the chart, and the
  focus ring is `--text` at 2px. Visible focus is non-negotiable.

---

## 11. Testing

| Layer | Tool | What |
|---|---|---|
| Pivot detection | Vitest | Synthetic series with known swings; assert exact pivot indices; assert no pivot in the last `k` bars |
| Fibonacci rules | Vitest | Table-driven: construct pivot sets at ratio boundaries (0.315/0.317, 0.49/0.51, 0.94/0.96) and assert accept/reject |
| Mirror symmetry | Vitest, property-based (`fast-check`) | For any random candle series, `detect(mirror(s))` un-mirrored must equal `detectDescending(s)` exactly |
| Fixtures | Vitest | Hermès and Boeing, ±1 bar (§7) |
| Scoring | Vitest | A hand-built perfect triangle scores ≥ 95; one with every timing rule violated loses exactly 15 |
| Resampling | Vitest | 1M→3M quarter alignment across a year boundary |
| API routes | Vitest | Zod rejection of bad params; error shape; no upstream URL in the body |
| E2E | Playwright | Load page → wait for scan → click first row → assert chart canvas rendered and URL updated |

Coverage gate: **90% on `src/lib/patterns/`**, 60% overall. The pattern engine is
where bugs are invisible and expensive; the UI is where they're obvious.

---

## 12. CI/CD

### Branching

- `main` is production. It is protected and always deployable.
- Work on `feat/…`, `fix/…`, `chore/…` branches.
- PR → Vercel preview deploy + CI checks → squash merge → production deploy.
- Conventional Commits for messages. Squash merge title becomes the commit.

### Branch protection on `main`

- Require a pull request before merging.
- **Required approvals: 0.** You are solo and GitHub will not let you approve
  your own PR; the required status checks are the real gate.
- Require status checks to pass: `lint`, `typecheck`, `test`, `build`,
  `e2e`.
- Require branches to be up to date before merging.
- Require linear history.
- Block force pushes and deletions.
- Include administrators — otherwise the protection is decorative.

### `.github/workflows/ci.yml`

Triggers on `pull_request` and `push` to `main`. One job with a matrix-free
sequence, using pnpm cache and Node 22:

```
setup → install --frozen-lockfile → lint → typecheck → test (with coverage)
→ build → e2e (Playwright, against the built app)
```

Upload the coverage summary and the Playwright report as artifacts. Fail the job
if the pattern-engine coverage gate is missed.

### Other workflows

- **`codeql.yml`** — GitHub CodeQL for JavaScript/TypeScript, on PRs and a
  weekly schedule.
- **`gitleaks.yml`** — secret scanning on every push.
- **`scan-cron.yml`** — Phase 6 only; `workflow_dispatch` plus schedule, writes
  results to Upstash.
- **`dependabot.yml`** — weekly npm updates grouped into a single PR, plus
  github-actions ecosystem updates. Group minor and patch together; keep major
  bumps separate.

### Vercel

- Connect the GitHub repo. Production branch: `main`. Preview deploys on every
  PR — leave these on, they're the manual QA step.
- **Enable Vercel Authentication on preview deployments** so previews aren't
  publicly indexable.
- Environment variables: set `EXCHANGE_PROVIDER` and any Upstash credentials for
  Production and Preview separately. Nothing goes in `NEXT_PUBLIC_*` unless it
  is genuinely public.
- Commit `.env.example` with every variable name and a comment. Never commit
  `.env.local`.

---

## 13. Security

The attack surface is small, but the app does proxy outbound requests, which is
exactly the thing to get right.

1. **Security headers** in `next.config.ts`:
   - `Content-Security-Policy` — nonce-based, generated in `middleware.ts`.
     Since all exchange calls are server-side, `connect-src 'self'` is enough.
     `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
     Avoid `unsafe-inline` on `script-src`; use the nonce.
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
2. **SSRF.** The `symbol` parameter is interpolated into an upstream URL. Validate
   it against the regex *and* membership in the cached universe. The provider
   base URL comes from a hard-coded allowlist in code, never from a request.
3. **Rate limiting.** Add `@upstash/ratelimit` on `/api/scan` (the expensive
   one), keyed by IP, e.g. 10 requests per minute. It's a personal app, but the
   URL is public and a scan is 200 outbound requests.
4. **No secrets in the client bundle.** Add a CI grep step that fails the build
   if anything matching a key pattern appears in `.next/static`.
5. **Dependencies.** `pnpm audit --audit-level=high` in CI. Dependabot weekly.
   Pin the lockfile; CI installs with `--frozen-lockfile`.
6. **Logging.** Structured logs, no full request URLs with parameters in
   production, no stack traces returned to the client.

---

## 14. Performance budgets

- First contentful paint under 1.5s on a mid-range phone over 4G.
- Initial JS under 200KB gzipped. `lightweight-charts` is roughly 45KB gzipped —
  load it with `next/dynamic` and `ssr: false`, since it touches the DOM.
- Detector runtime under 15ms per pair per timeframe for 1000 candles. Measure
  it with a Vitest benchmark; if it's slower, the pivot loop is the place to
  look.
- Scan streaming: first result visible within 2 seconds of the request.

---

## 15. Milestones

| Phase | Deliverable | Rough size |
|---|---|---|
| **0** | Provider spike, adapter interface, decision recorded | 0.5 day |
| **1** | Repo scaffold, Tailwind + palette tokens, CI green on an empty app, Vercel connected, branch protection on | 0.5 day |
| **2** | Exchange adapters, Zod schemas, resampling, `/api/klines`, unit tests | 1 day |
| **3** | Pivot detection + triangle detector + scoring, unit tests, **fixtures passing** | 2 days |
| **4** | Chart component with candles, trendline primitive, pivot markers, pole band | 1 day |
| **5** | Screener panel, filters, streaming `/api/scan`, click-to-load wiring, responsive layout | 1.5 days |
| **6** | Security headers, rate limiting, CodeQL, Dependabot, Playwright smoke test | 0.5 day |
| **7** | *Optional:* GitHub Actions cron + Upstash pre-computed scans | 1 day |
| **8** | Threshold tuning against live crypto data; README with screenshots | ongoing |

Phase 3 is the one that will take longer than estimated. Budget for it.

---

## 16. Open decisions

Record answers in `docs/decisions.md` as they're made.

- **DECIDE** Primary and fallback exchange (Phase 0).
- **DECIDE** Public or private repo (affects free Actions minutes for Phase 7).
- **DECIDE** Spot only, or perpetuals too? Perps have more pairs and cleaner
  liquidity but different symbol conventions.
- **DECIDE** Universe size. 200 is a starting number; higher means longer scans.
- **DECIDE** Whether `5m` and `15m` are worth keeping after tuning. They may
  produce so much noise that they're not useful even with a strong ATR filter.
  Keep them behind the timeframe selector and judge after Phase 8.
