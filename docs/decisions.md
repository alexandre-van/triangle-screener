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
