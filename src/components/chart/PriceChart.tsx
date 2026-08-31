"use client";

import {
  CandlestickSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { Candle } from "@/lib/exchange/types";
import type { TrianglePattern } from "@/lib/patterns/triangle";
import { CHART } from "./theme";
import { TrianglePrimitive } from "./TrianglePrimitive";

export interface PriceChartProps {
  candles: readonly Candle[];
  pattern?: TrianglePattern;
}

const toSeriesData = (candles: readonly Candle[]): CandlestickData<Time>[] =>
  candles.map((c) => ({
    time: c.time as Time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));

export default function PriceChart({ candles, pattern }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time>>(null);
  const primitiveRef = useRef<TrianglePrimitive>(null);

  // Create once. Data and pattern updates happen in their own effects so that
  // changing a pair does not tear down and rebuild the whole chart.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const chart = createChart(container, {
      layout: {
        background: { color: CHART.bg },
        textColor: CHART.textMuted,
        fontFamily:
          "var(--font-instrument-sans), ui-sans-serif, system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: CHART.grid },
        horzLines: { color: CHART.grid },
      },
      crosshair: {
        vertLine: {
          color: CHART.textMuted,
          style: 2,
          labelBackgroundColor: CHART.accent,
        },
        horzLine: {
          color: CHART.textMuted,
          style: 2,
          labelBackgroundColor: CHART.accent,
        },
      },
      rightPriceScale: { borderColor: CHART.border },
      timeScale: { borderColor: CHART.border, rightOffset: 12 },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: CHART.text,
      downColor: CHART.accent,
      borderUpColor: CHART.text,
      borderDownColor: CHART.accent,
      wickUpColor: CHART.bullWick,
      wickDownColor: CHART.bearWick,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // lightweight-charts will not resize itself — CLAUDE.md. Without this the
    // chart keeps whatever size it had at creation, forever.
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      primitiveRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (series === null) return;
    series.setData(toSeriesData(candles));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Frame the pattern, not the whole history. A token that has fallen 97% over
  // 999 bars draws its triangle as a few pixels in the corner — the one thing
  // the page exists to show, invisible.
  useEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return;
    if (pattern === undefined) {
      chart.timeScale().fitContent();
      return;
    }
    const indices = [
      pattern.pivots.pole,
      pattern.pivots.h1,
      pattern.pivots.l1,
      pattern.pivots.h2,
      pattern.pivots.l2,
      pattern.pivots.h3,
      pattern.pivots.l3,
    ]
      .filter((p) => p !== undefined)
      .map((p) => p.index);

    const first = Math.min(...indices);
    const last = candles.length - 1;
    const context = Math.max(20, Math.round((last - first) * 0.35));

    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, first - context) as Logical,
      to: (last + Math.round(context * 0.6)) as Logical,
    });
  }, [pattern, candles.length]);

  useEffect(() => {
    const series = seriesRef.current;
    if (series === null) return;

    if (pattern === undefined) {
      if (primitiveRef.current !== null) {
        series.detachPrimitive(primitiveRef.current);
        primitiveRef.current = null;
      }
      return;
    }

    if (primitiveRef.current === null) {
      const primitive = new TrianglePrimitive(pattern);
      series.attachPrimitive(primitive);
      primitiveRef.current = primitive;
    } else {
      primitiveRef.current.setPattern(pattern);
    }
  }, [pattern]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      data-testid="price-chart"
    />
  );
}
