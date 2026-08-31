export interface LineSpec {
  slope: number;
  intercept: number;
  anchorBarIndex: number;
}

export interface FittedLine extends LineSpec {
  /** RMS residual **before** translation. Low error means clean touches. */
  fitError: number;
}

export interface Point {
  index: number;
  price: number;
}

export const valueAt = (line: LineSpec, barIndex: number): number =>
  line.slope * barIndex + line.intercept;

/**
 * §6.6. With two points, the line through them. With three, a least-squares
 * fit translated vertically so it touches the most extreme point without
 * cutting through it — resistance sits at or above every high, support at or
 * below every low.
 *
 * `side` is which way the translation goes: "above" for resistance, "below"
 * for support.
 */
export const fitLine = (
  points: readonly Point[],
  side: "above" | "below",
): FittedLine => {
  if (points.length < 2) {
    throw new RangeError("a line needs at least two points");
  }
  const anchorBarIndex = points[0].index;

  let slope: number;
  let intercept: number;
  let fitError = 0;

  if (points.length === 2) {
    const [a, b] = points;
    slope = (b.price - a.price) / (b.index - a.index);
    intercept = a.price - slope * a.index;
  } else {
    const n = points.length;
    const meanX = points.reduce((s, p) => s + p.index, 0) / n;
    const meanY = points.reduce((s, p) => s + p.price, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of points) {
      num += (p.index - meanX) * (p.price - meanY);
      den += (p.index - meanX) ** 2;
    }
    slope = den === 0 ? 0 : num / den;
    intercept = meanY - slope * meanX;

    const sq = points.reduce(
      (s, p) => s + (p.price - (slope * p.index + intercept)) ** 2,
      0,
    );
    fitError = Math.sqrt(sq / n);
  }

  // Translate so no point sits on the wrong side of the line.
  const offsets = points.map((p) => p.price - (slope * p.index + intercept));
  const shift = side === "above" ? Math.max(...offsets) : Math.min(...offsets);

  return { slope, intercept: intercept + shift, anchorBarIndex, fitError };
};

/**
 * Where the two lines meet, as a bar index. Used to draw the lines forward and
 * as a scoring input — never as a filter. §6.3 rule 4 has no apex-distance
 * rule: Boeing's apex is 486 bars past L3 and it is still the pattern we want.
 */
export const apexBarIndex = (
  resistance: LineSpec,
  support: LineSpec,
): number | undefined => {
  const dSlope = resistance.slope - support.slope;
  if (dSlope === 0) return undefined;
  const x = (support.intercept - resistance.intercept) / dSlope;
  return Number.isFinite(x) ? x : undefined;
};
