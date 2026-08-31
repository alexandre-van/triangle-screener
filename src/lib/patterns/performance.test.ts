import { expect, it } from "vitest";
import type { Candle } from "../exchange/types";
import { configFor } from "./config";
import { detectTriangles } from "./triangle";

/**
 * §14: detection must run in under 15ms per pair per timeframe at 1000 bars.
 *
 * Skipped under coverage. V8's instrumentation makes this roughly 25x slower,
 * so the number it produces is not the number the budget is about — and CI
 * runs the coverage variant, which would fail the build on every commit.
 */
it.skipIf(process.env.COVERAGE === "1")(
  "detects on 1000 candles well inside the 15ms budget",
  () => {
    let price = 1000;
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const candles: Candle[] = Array.from({ length: 1000 }, (_, i) => {
      const open = price;
      price = Math.max(50, price * (1 + (random() - 0.5) * 0.06));
      const close = price;
      return {
        time: 1_700_000_000 + i * 3600,
        open,
        close,
        high: Math.max(open, close) * 1.005,
        low: Math.min(open, close) * 0.995,
        volume: 1,
      };
    });

    const opts = {
      symbol: "BTCUSDT",
      timeframe: "1h" as const,
      config: configFor("1h"),
    };
    detectTriangles(candles, opts); // warm up

    const started = performance.now();
    const runs = 20;
    for (let i = 0; i < runs; i++) detectTriangles(candles, opts);
    const perRun = (performance.now() - started) / runs;

    expect(perRun).toBeLessThan(15);
  },
);
