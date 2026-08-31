import { describe, expect, it, vi } from "vitest";
import { backoffMs, createPacer } from "./rateLimit";

describe("createPacer", () => {
  it("spaces starts by the interval, however many callers arrive at once", async () => {
    vi.useFakeTimers();
    try {
      const pace = createPacer(10); // one every 100ms
      const starts: number[] = [];
      const jobs = Array.from({ length: 5 }, () =>
        pace(async () => {
          starts.push(Date.now());
        }),
      );
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all(jobs);

      expect(starts).toHaveLength(5);
      for (let i = 1; i < starts.length; i++) {
        expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(100);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not delay a caller that arrives after the budget has recovered", async () => {
    let clock = 0;
    const pace = createPacer(10, () => clock);
    await pace(async () => undefined);
    clock = 10_000; // long idle
    const started = Date.now();
    await pace(async () => undefined);
    expect(Date.now() - started).toBeLessThan(50);
  });

  it("returns whatever the paced function returns", async () => {
    const pace = createPacer(1000);
    await expect(pace(async () => 42)).resolves.toBe(42);
  });

  it("propagates a rejection rather than swallowing it", async () => {
    const pace = createPacer(1000);
    await expect(
      pace(async () => Promise.reject(new Error("nope"))),
    ).rejects.toThrow("nope");
  });
});

describe("backoffMs", () => {
  it("grows exponentially", () => {
    const mid = () => 0.5;
    expect(backoffMs(0, mid)).toBeLessThan(backoffMs(1, mid));
    expect(backoffMs(1, mid)).toBeLessThan(backoffMs(2, mid));
  });

  it("jitters, so retries do not resynchronise", () => {
    expect(backoffMs(2, () => 0)).not.toBe(backoffMs(2, () => 1));
  });

  it("stays positive at every attempt", () => {
    for (let a = 0; a < 3; a++) {
      expect(backoffMs(a, () => 0)).toBeGreaterThan(0);
    }
  });
});
