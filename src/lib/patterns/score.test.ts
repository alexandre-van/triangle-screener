import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { score, type ScoreInputs } from "./score";

const PERFECT: ScoreInputs = {
  highSteps: [0, 0], // flat resistance — the definition of an ascending triangle
  fLows: [0.5, 0.5], // the ideal half-retracement
  timingPassed: 3,
  timingApplicable: 3,
  poleRatio: 2.0,
  fitErrorAtr: 0,
  apexProgress: 0.675,
  hasH3: true,
  hasL3: true,
};

describe("score — §11", () => {
  it("gives a hand-built perfect triangle at least 95", () => {
    expect(score(PERFECT, DEFAULT_CONFIG).total).toBeGreaterThanOrEqual(95);
  });

  it("costs exactly 15 to violate every timing rule", () => {
    const perfect = score(PERFECT, DEFAULT_CONFIG).total;
    const untimely = score(
      { ...PERFECT, timingPassed: 0 },
      DEFAULT_CONFIG,
    ).total;
    expect(perfect - untimely).toBeCloseTo(15, 5);
  });
});

describe("high-pivot component", () => {
  it("rewards a flat resistance most", () => {
    const flat = score(
      { ...PERFECT, highSteps: [0, 0] },
      DEFAULT_CONFIG,
    ).highFib;
    const sloped = score(
      { ...PERFECT, highSteps: [0.2, 0.2] },
      DEFAULT_CONFIG,
    ).highFib;
    expect(flat).toBe(25);
    expect(sloped).toBeLessThan(flat);
  });

  it("bottoms out at the edge of the allowed band", () => {
    const edge = score(
      { ...PERFECT, highSteps: [DEFAULT_CONFIG.fibHighMax] },
      DEFAULT_CONFIG,
    );
    expect(edge.highFib).toBeCloseTo(0, 5);
  });
});

describe("low-pivot component", () => {
  it("peaks at the half retracement", () => {
    const ideal = score({ ...PERFECT, fLows: [0.5] }, DEFAULT_CONFIG).lowFib;
    expect(ideal).toBe(25);
  });

  it("falls off gently below the ideal and steeply above it", () => {
    const below = score({ ...PERFECT, fLows: [0.2] }, DEFAULT_CONFIG).lowFib;
    const above = score({ ...PERFECT, fLows: [0.8] }, DEFAULT_CONFIG).lowFib;
    expect(below).toBeGreaterThan(above);
  });

  it("still gives a near-flat support about half marks", () => {
    // Real triangles sit far below the brief's 0.236-0.786 ideal; three of the
    // four fixture values do. If this drops much lower both fixtures fail §7.
    const flat = score({ ...PERFECT, fLows: [0.05] }, DEFAULT_CONFIG).lowFib;
    expect(flat).toBeGreaterThan(11);
    expect(flat).toBeLessThan(14);
  });
});

describe("pole component", () => {
  it("is continuous across the qualifying boundary", () => {
    // A pole sitting exactly on minPoleRatio must score the same as no pole at
    // all, or a pattern is better off with a barely-qualifying pole than with
    // none — which is backwards.
    const none = score(
      { ...PERFECT, poleRatio: undefined },
      DEFAULT_CONFIG,
    ).pole;
    const marginal = score(
      { ...PERFECT, poleRatio: DEFAULT_CONFIG.minPoleRatio },
      DEFAULT_CONFIG,
    ).pole;
    expect(none).toBeCloseTo(marginal, 10);
  });

  it("rewards a stronger pole", () => {
    const weak = score({ ...PERFECT, poleRatio: 1.0 }, DEFAULT_CONFIG).pole;
    const strong = score({ ...PERFECT, poleRatio: 2.0 }, DEFAULT_CONFIG).pole;
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBe(15);
  });

  it("caps at full marks however long the pole", () => {
    expect(score({ ...PERFECT, poleRatio: 10 }, DEFAULT_CONFIG).pole).toBe(15);
  });
});

describe("completeness", () => {
  it("awards five points each for H3 and L3", () => {
    const forming = score(
      { ...PERFECT, hasH3: false, hasL3: false },
      DEFAULT_CONFIG,
    );
    expect(PERFECT.hasH3 && PERFECT.hasL3).toBe(true);
    expect(forming.completeness).toBe(0);
    expect(
      score({ ...PERFECT, hasL3: false }, DEFAULT_CONFIG).completeness,
    ).toBe(5);
  });
});

describe("timing", () => {
  it("scores pro-rata over the rules that apply", () => {
    // A forming pattern has no t5/t6 yet; it is not punished for their absence.
    const half = score(
      { ...PERFECT, timingPassed: 1, timingApplicable: 2 },
      DEFAULT_CONFIG,
    ).timing;
    expect(half).toBe(7.5);
  });

  it("gives full marks when nothing is measurable yet", () => {
    expect(
      score(
        { ...PERFECT, timingPassed: 0, timingApplicable: 0 },
        DEFAULT_CONFIG,
      ).timing,
    ).toBe(15);
  });
});
