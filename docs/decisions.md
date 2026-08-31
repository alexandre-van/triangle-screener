# Decision log

Append-only. Newest last.

---

## 2026-08-31 — Fixture data source and repair

**Decision:** Fixtures come from Yahoo Finance's daily endpoint
(`query1.finance.yahoo.com/v8/finance/chart/{BA,RMS.PA}?interval=1d`),
resampled locally to Monday-anchored weeks. Committed to `docs/fixtures/`.

**Why not Stooq**, as PLAN.md §7 suggested: Stooq now serves a JavaScript
proof-of-work challenge to `curl`, so it is no longer a keyless CSV endpoint.

**Why daily, not `interval=1wk`:** Yahoo anchors weekly bars to the day of week
that `period1` falls on. A `period1` of 1999-01-01 produced Friday-to-Friday
weeks, which do not line up with the brief's pivot dates. Resampling daily bars
into ISO weeks (Monday start) reproduces what TradingView shows.

**Data repair applied:** Yahoo emits placeholder rows for Paris market holidays
— `volume = 0`, `open = high = low` set to a junk value (13.444 while Hermès
traded near 40), `close` carried over from the previous session. 37 such rows in
RMS.PA, none in BA. Resampled naively they inject false weekly lows, including
in the week of L2. The loader drops any daily bar with `volume == 0 && open ==
high == low`. Both fixtures are clean afterwards.

Result: `ba-weekly.csv` 1443 bars (1999-01-04 → 2026-08-24), `rms-weekly.csv`
1391 bars (2000-01-03 → 2026-08-24).

---

## 2026-08-31 — §6.3 rule 1: pivots are selected, not consecutive

**Decision:** Drop "the pivots are consecutive in the alternating sequence — no
skipped swings." Replaced by §6.2b: **the three largest non-overlapping declines
in the window; their six endpoints are the six pivots.**

**Why the old rule had to go:** it makes both hand-verified fixtures
undetectable, at every `pivotStrength`. Intervening swings between the brief's
own pivots at k = 4:

- Hermès: 7, 1, 7, 9, 3
- Boeing: 9, 9, 9, 7, 3

A triangle spanning four to six years necessarily contains dozens of smaller
swings between its corners. No threshold change rescues it; the rule is
structurally wrong.

**Route not taken — ranking individual turning points.** The first replacement
tried was hierarchical zigzag simplification: rank pivots by topographic
prominence, dissolve the smallest swing repeatedly until six remain. It
recovered Boeing exactly but failed Hermès, dropping H3 and L3 in favour of an
unrelated 2002 rally. The two swings measure 0.281 and 0.289 in log price — a 3%
margin decided the outcome. It also needed a candidate pool of 10 rather than 6
to be workable, and was sensitive to the window to within ±10 bars.

**The rule that replaced it (user's constraint):** a rally or pullback that has
already been used to fix one high/low pair must not be reused for the next one.
Each move is spent once. Applied to an ascending triangle, whose three declines
`H1→L1`, `H2→L2`, `H3→L3` are inherently disjoint, this becomes: take the three
largest non-overlapping declines.

A *clean decline* `a → b` is one where `high[a]` is the maximum over `[a, b]`
and `low[b]` is the minimum over `[a, b]`. Size is `log(high[a]) − log(low[b])`.

**Log price, not absolute.** Ranked in euros over the full RMS series the six
correct pivots come 219th to 320th, because Hermès went from €40 to €2500 and
every recent wiggle outranks the 2001 triangle. In log space they rank first.

**Result — exact recovery of both fixtures**, all six pivots and no extras, at
every window padding from 0 to 100 bars:

| | selected moves (log size) |
|---|---|
| Hermès | 0.649, 0.587, 0.281 |
| Boeing (mirrored) | 1.141, 0.862, 0.680 |

Window tolerance is wide: Hermès spans 213 bars and survives 395 extra bars
before the pattern and 130 after; Boeing spans 306 and survives 135 before and
395 after. A coarse sweep of window lengths suffices.

Two properties come free and should be asserted in tests: alternation is
automatic (three disjoint `H→L` moves sorted by time are `H,L,H,L,H,L` by
construction), and the descending case needs no new code (clean declines on the
mirrored series are clean rallies).

`candidatePoolSize` was introduced for the zigzag approach and is now removed —
this rule selects exactly six.

---

## 2026-08-31 — §6.3 rule 3: the Fibonacci low band becomes a score, not a gate

**Decision:** `FIB_LOW_MIN = 0.236` / `FIB_LOW_MAX = 0.786` are no longer
admission criteria. Hard bounds become `f_low ∈ (0.0, 0.95)`. The 0.236–0.786
band stays as the *ideal* range for scoring only.

**Why:** three of the four measurable `f_low` values in the fixtures fall below
the old floor, most of them far below:

| | `f_low(2)` | `f_low(3)` |
|---|---|---|
| Hermès | 0.031 | 0.407 |
| Boeing | 0.067 | 0.095 |

Admitting these would require a floor near 0.02, which removes the constraint
anyway. The brief's 0.236–0.786 describes a best-case triangle, not the
admission gate. Real triangles have a rising side that rises only slightly —
Hermès went 33.33 → 34.20 over 77 weeks — and that near-flatness is part of
what makes the shape compress.

**Consequence for scoring:** the low-side falloff must be gentle. A pattern at
`f_low ≈ 0.05` should still take roughly half of the 25 points, or both
fixtures score below the 70 that §7 requires of them.

---

## 2026-08-31 — §6.3 rule 4: apex distance rule removed

**Decision:** `config.maxApexBars` is deleted. Convergence is tested by the two
slopes alone. The apex is still computed, for drawing the lines forward and as
a geometry scoring input, but never rejects a candidate.

**Why:** Boeing's apex falls 486 bars — about nine years — past L3, against a
limit of 200. Hermès is fine at 152. Large slow triangles legitimately point
far into the future, and the rule only penalises the biggest, clearest
patterns. Cheaper to compute too.

---

## 2026-08-31 — Direction is set by the pole; Boeing is descending

**Decision:** Boeing is a **descending** triangle. More generally, `direction`
is decided by which reading of the series — as-is or mirrored — has a
qualifying **pole**, not by comparing the two trendline slopes. `subtype:
'symmetrical'` becomes a shape tag that never overrides `direction`.

**Why:** on slopes alone Boeing reads symmetrical — its lows rise 89 → 113 → 129
while its highs fall 279 → 268 → 254. But it is preceded by a decline from
446.01 (2019-02-25, the pre-737-MAX high) to 89.00, 55 bars long, with a worst
pullback of only 13%. That is a textbook descending pole, and it is what the
pattern is leaning on.

**Two fixes were needed to make the pole test actually work.**

*1. Cleanliness must be measured against the running high.* §6.4 said "no low
between P and H1 is more than 40% of the way back down the pole". Read
literally that rejects every pole that has ever existed, because the bars just
after P are still near the bottom by construction — it rejected all four
candidates here, including a near-vertical crash. Measured as a drawdown from
the running high, the numbers become meaningful: Boeing descending 13%, Boeing
ascending 38%, Hermès ascending 39%, Hermès descending 23%.

*2. A minimum pole length is required.* `minPoleBars`, default 10, is new.
Without it Boeing's ascending reading finds a **4-bar** pole scoring 1.43 —
noise off the COVID low — which beats the real 55-bar descending pole at 1.41
and flips the label. Sweep:

| `minPoleBars` | Boeing ascending | Boeing descending | winner |
|---|---|---|---|
| 0 | 1.43 (4 bars) | 1.41 (55 bars) | ascending ✗ |
| 5, 10, 15, 20 | none qualifies | 1.41 (55 bars) | **descending ✓** |

**Hermès is not a counter-example.** Its mirrored reading does produce a pole
(ratio 0.90) but the pivots it selects are `[89, 100, 144, 148, 166, 222]`, not
the brief's pattern, and that candidate fails §6.3 rule 2 outright — its third
high overshoots the second by 41% against a 0.5% tolerance. Only the ascending
reading yields a valid triangle, so there is no direction conflict to resolve.

**Note on Hermès's own pole:** ratio 0.72, below the `minPoleRatio` default of
1.0, and its start is clipped by the data (Yahoo's RMS.PA history begins
2000-01-03, and H1 sits at bar 44). The pole is optional per §6.4, so this is
fine — Hermès reads as a reversal-type triangle — but it means the fixture will
not earn pole points.

---

## 2026-08-31 — §6.3 rule 2: the overshoot tolerance must be additive

**Decision:** write the upper bound as
`h(n) + OVERSHOOT × (h(n) − l(n))`, not `h(n) × (1 + OVERSHOOT)`.

**Why:** the mirror trick (§6.1) negates prices. Multiplying a *negative* price
by `1.005` moves it further from zero — downward — so a multiplicative
tolerance opens the band in the wrong direction for every descending pattern.
Found while checking Hermès's mirrored candidate, where the bound has to reject
a 41% overshoot. Expressed in units of the leg's own range the rule is
scale-free and mirror-safe. The §12 mirror property test should catch any
regression here.

---

## 2026-08-31 — Phase 1 scaffold: deviations from §2

**Next.js 16, not 15.** `create-next-app@latest` now emits Next 16.3.3 with
React 19.2. Nothing in the plan depends on a Next 15 API, so pinning backwards
to get an older major would have bought nothing but a stale dependency. §2
updated in the same commit.

**pnpm is installed with `npm i -g pnpm`, not corepack.** Homebrew's Node
formula ships without corepack, so `corepack enable` fails on this machine.
`packageManager` in `package.json` still pins the version, and CI uses
`pnpm/action-setup`, which reads it.

**Node 22 in CI, Node 25 locally.** The plan asks for Node 22 and CI runs it.
The local machine is on Homebrew's Node 25; `engines` is `>=22`. Worth
remembering if something builds locally and not in CI.

**Playwright runs on port 3117, and never reuses a running server.** The
default `reuseExistingServer: !process.env.CI` attached the smoke test to an
unrelated app already serving port 3000 and asserted against its markup. A
fixed uncommon port plus `reuseExistingServer: false` means the E2E suite can
only ever test this app's own production build.

**Prettier does not format the prose docs.** `PLAN.md`, `CLAUDE.md` and
`docs/` are in `.prettierignore`: prettier reflows their hand-wrapped
paragraphs and turns a two-line change into a 274-line diff. Code, configs and
`README.md` are formatted normally.

**`.env.example` is not committed.** The environment this scaffold was built in
refuses writes to `.env*` paths. The variables it would have held are
documented as a table in `README.md` instead, which is the copy people actually
read. Add the file by hand if you want it.

**Purity of `src/lib/patterns/` is enforced by ESLint**, not only by
convention: `no-restricted-globals` on `fetch`, `Date` and `console`, and
`no-restricted-properties` on `Math.random` and `Date.now`, scoped to that
directory. The 90% coverage gate lives in `vitest.config.ts` as a per-glob
threshold, so `pnpm test:coverage` fails the build rather than reporting.

---

## 2026-08-31 — The client-bundle secret check greps for values, not words

**Decision:** `scripts/check-bundle-secrets.sh` replaces the inline grep in CI.
It matches known credential *formats* (private key blocks, `ghp_`/`gho_`,
`github_pat_`, `sk-`, `AKIA`, `xox*`, `AIza`) and an explicit deny-list of
server-only environment variable names, currently the two Upstash ones.

**Why:** the first version grepped for the words `api_key`, `secret` and
`password`, and failed the very first CI run on two framework chunks. Nothing
had leaked — `password` appears as a property name in minified Next output, not
least because `url.password` is part of the WHATWG URL API. A check that fails
on every build is a check that gets ignored or deleted, which is worse than not
having one.

Names in the deny-list are the real signal for this project: none of them is
`NEXT_PUBLIC_`, so any occurrence in client output means a server module was
pulled into the browser graph. **Add to `DENY_ENV` whenever a server-only
variable is introduced.** The script takes the directory as an argument so it
can be pointed at a fixture, and both branches are covered by a planted-token
check.

---

## 2026-08-31 — §4 provider spike: OKX is primary, Bybit is geo-blocked

**Decision:** **OKX spot is the primary provider.** Bybit moves behind
`EXCHANGE_PROVIDER` alongside Binance, as a region-dependent option. This
reverses §4's expected outcome, which was "Bybit primary, OKX fallback".

**Evidence.** `scripts/spike-exchange.mjs`, run from a GitHub Actions runner in
Virginia (40.76.239.96, Azure, us-east) on 2026-08-31, and separately from the
laptop in Bali:

| Provider | GitHub Actions (US) | Bali laptop |
|---|---|---|
| Bybit spot | **403** — "The Amazon CloudFront distribution is configured to block access from your country" | TLS intercepted at the ISP |
| Bybit linear | **403** — same | same |
| Binance | **451** | same |
| OKX | **200** — 300 candles, 1385 tickers (395 USDT spot) | same |
| Kraken | **200** — 721 candles, 1466 tickers (**47 USDT**) | same |

**Why this overrides §4's "do not re-litigate".** That instruction protects the
*reasoning* — that a provider working on a laptop tells you nothing about a
provider working from a Vercel function. The reasoning stands; it just applies
to Bybit as well. GitHub's hosted runners are US-only and Vercel's default
function region is `iad1`, which is the same Virginia metro the spike ran from.
Bybit fails there for exactly the reason Binance does. §0 says to update the
plan when it turns out to be wrong, so §4 and §5.2 are updated in this PR.

**Kraken is not a viable fallback** for this app: 47 USDT pairs against OKX's
395. It is a USD/EUR venue. A 200-pair USDT universe cannot be built from it.

**Bybit is still worth keeping** because it works from a Vercel deployment
pinned to a region it serves — `sin1` or `hnd1`. That is a real escape hatch if
OKX ever blocks. Note it would not rescue the Phase 7 GitHub Actions cron,
whose runner region is not selectable.

**OKX is the better fit on the merits, not just on reachability:**

- It serves **all thirteen timeframes natively**, `3d` and `3M` included. Bybit
  has neither and needs `resample.ts` for both.
- Its candles carry an explicit **`confirm` flag** — `"0"` for the forming bar,
  `"1"` for closed. The repaint hazard is stated in the data instead of
  inferred from position.

**Two OKX quirks the adapter absorbs:**

1. **Bars of 6H and above are Hong Kong-anchored (UTC+8) unless the `utc`
   suffix is used.** Every daily, weekly and monthly candle would otherwise sit
   eight hours from where TradingView draws it. The adapter maps `1d` to
   `1Dutc`, not `1D`. Timeframes below 6H have no variant and need none.
2. **`limit` is capped at 300**, against §5.3's ask for 1000, so `getCandles`
   pages backwards with `after` and dedupes the bar repeated across the seam.
   Four requests per pair per timeframe where Bybit would need one.

Like Bybit, OKX returns **newest-first strings with millisecond timestamps**,
and reports business errors inside a 200 response.

**The Bybit adapter is written but unverified against a live response.** No
environment reachable from here can call it. Its tests are built from the
documented shape in §5.2 and pin the quirks the adapter absorbs, not Bybit's
behaviour. If it is ever switched on, verify it against a real payload first.

---

## 2026-08-31 — Bybit's retCode is checked before its payload is validated

**Decision:** the Bybit envelope (`retCode`, `retMsg`, `result: unknown`) is
validated separately from `result`, and `retCode` is checked first.

**Why:** a Bybit error response carries `result: {}`. Validating the payload
shape in one pass makes every business error — including **retCode 10006, the
rate limiter** — surface as `bad_response`. The scanner's backoff keys on
`rate_limited`, so it would never fire, and the penalty for overrunning Bybit
is a 10-minute IP ban. Found by a test asserting the 10006 mapping.

The same ordering applies to OKX, whose `data` is `[]` on error — harmless
there, since an empty array still parses, but the adapter checks `code` first
regardless.

---

## 2026-08-31 — An unlisted pair is a 404, and upstream error text stops at the route

**Decision:** `ExchangeErrorCode` gains `unknown_symbol`. OKX code 51001
("Instrument ID does not exist") maps to it, and `/api/klines` answers **404**.
The route no longer echoes `ExchangeError.message` to the client; it composes
its own copy per code.

**Why:** found by probing the live deployment. `GET /api/klines?symbol=
NOTAREALCOINUSDT&tf=1d` answered **502** with the body

> `okx returned code 51001: Instrument ID, Instrument ID code, or Spread ID does not exist`

Two things wrong. A pair that is not listed is the caller's mistake, not a
failure of the gateway — a 502 tells a client to retry something that will
never succeed. And the upstream's own error text is written for an exchange
integrator, not for someone looking at a chart.

The client copy still names the provider, because §9 asks errors to say what
failed — "Couldn't reach okx" — but it carries no upstream code or phrasing.

**Bybit is not given the same mapping.** Its unlisted-symbol response is
retCode 10001, which is also its generic parameter error, and there is no
environment here that can call Bybit to check which. Guessing would turn real
parameter bugs into 404s. It stays `upstream_error` until someone can verify it.

**This is a stopgap.** §8.4 wants the symbol checked against the cached
universe before it reaches an upstream URL at all. That arrives with
`universe.ts` in Phase 5, and will catch this case before a request is made.
