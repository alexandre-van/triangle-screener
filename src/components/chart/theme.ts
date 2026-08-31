/**
 * Chart tokens from PLAN.md §9. Four hex values plus amber alpha overlays —
 * no new hues.
 *
 * `#CA3C25` on `#0A2503` is only 3.3:1, so it is for candle bodies, the
 * descending trendline and large numerals. Never small text.
 */
export const CHART = {
  bg: "#0A2503",
  text: "#E6AA68",
  accent: "#CA3C25",
  textMuted: "rgb(230 170 104 / 0.62)",
  textFaint: "rgb(230 170 104 / 0.38)",
  grid: "rgb(230 170 104 / 0.07)",
  border: "rgb(230 170 104 / 0.16)",
  poleBand: "rgb(230 170 104 / 0.10)",
  bullWick: "rgb(230 170 104 / 0.70)",
  bearWick: "rgb(202 60 37 / 0.70)",
} as const;

export const PIVOT_MARKER_RADIUS = 3.5;
export const TRENDLINE_WIDTH = 2;
/** How far past the last pivot the lines are drawn forward, in bars. */
export const PROJECTION_BARS = 40;
