import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { fLow, fLowOk, highStep, highStepOk } from "./rules";

const c = DEFAULT_CONFIG;

describe("rule 2 — highs step down, but only slightly", () => {
  it("measures the step in units of the leg's own range", () => {
    // H1 200, L1 100, H2 190: a tenth of the way down the range.
    expect(highStep(200, 100, 190)).toBeCloseTo(0.1, 10);
    expect(highStep(200, 100, 200)).toBe(0);
  });

  it.each([
    [0.315, true],
    [0.316, true],
    [0.317, false],
  ])("step %s is accepted: %s", (step, ok) => {
    expect(highStepOk(step, c)).toBe(ok);
  });

  it("allows a marginal higher high, because real markets make them", () => {
    expect(highStepOk(-0.004, c)).toBe(true);
    expect(highStepOk(-0.005, c)).toBe(true);
    expect(highStepOk(-0.006, c)).toBe(false);
  });

  it("is scale-free, so it survives the mirror", () => {
    // The same geometry at negative prices — what §6.1 hands the detector for
    // a descending pattern. A multiplicative tolerance inverts here.
    const upright = highStep(200, 100, 190);
    const mirrored = highStep(-100, -200, -110);
    expect(mirrored).toBeCloseTo(upright, 10);
    expect(highStepOk(mirrored, c)).toBe(highStepOk(upright, c));
  });

  it("accepts both fixtures' measured steps", () => {
    // PLAN.md §7: Hermès 0.073, 0.118; Boeing 0.127, 0.103.
    for (const step of [0.073, 0.118, 0.127, 0.103]) {
      expect(highStepOk(step, c), `${step}`).toBe(true);
    }
  });
});

describe("rule 3 — the low retraces the leg it just closed", () => {
  it("measures against the leg the low just closed, not an older range", () => {
    // L1 100, H2 200, L2 150: half way back into the L1->H2 leg.
    expect(fLow(100, 200, 150)).toBeCloseTo(0.5, 10);
    expect(fLow(100, 200, 100)).toBe(0);
    expect(fLow(100, 200, 200)).toBe(1);
  });

  it.each([
    [0.94, true],
    [0.949, true],
    [0.95, false],
    [0.96, false],
  ])("f_low %s is accepted: %s", (f, ok) => {
    expect(fLowOk(f, c)).toBe(ok);
  });

  it("requires the low to actually rise", () => {
    expect(fLowOk(0, c)).toBe(false);
    expect(fLowOk(-0.1, c)).toBe(false);
    expect(fLowOk(0.001, c)).toBe(true);
  });

  it("accepts all four fixture values, three of which are below the ideal band", () => {
    // Hermès 0.031, 0.407; Boeing 0.067, 0.095. The 0.236-0.786 band is the
    // ideal, not the gate.
    for (const f of [0.031, 0.407, 0.067, 0.095]) {
      expect(fLowOk(f, c), `${f}`).toBe(true);
      expect(f, `${f}`).toBeLessThan(0.786);
    }
  });

  it("is scale-free under the mirror", () => {
    const upright = fLow(100, 200, 150);
    const mirrored = fLow(-200, -100, -150);
    expect(mirrored).toBeCloseTo(upright, 10);
  });
});
