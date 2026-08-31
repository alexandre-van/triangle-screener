"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ChartPanel } from "./chart/ChartPanel";
import { ScreenerPanel } from "./screener/ScreenerPanel";
import type { Timeframe } from "@/lib/exchange/types";
import type { TrianglePattern } from "@/lib/patterns/triangle";
import type { DirectionFilter } from "@/lib/scan/scanner";

export interface WorkspaceProps {
  initialSymbol: string;
  initialTimeframe: Timeframe;
  initialDirection: DirectionFilter;
}

type MobileView = "chart" | "screener";

export function Workspace({
  initialSymbol,
  initialTimeframe,
  initialDirection,
}: WorkspaceProps) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [direction, setDirection] = useState<DirectionFilter>(initialDirection);
  const [view, setView] = useState<MobileView>("chart");

  // §10: the selection lives in the URL so a chart view is linkable and
  // survives a refresh. replace, not push — filtering is not history.
  const syncUrl = useCallback(
    (next: { symbol?: string; tf?: Timeframe; dir?: DirectionFilter }) => {
      const params = new URLSearchParams({
        symbol: next.symbol ?? symbol,
        tf: next.tf ?? timeframe,
        dir: next.dir ?? direction,
      });
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, symbol, timeframe, direction],
  );

  const selectPattern = (pattern: TrianglePattern) => {
    setSymbol(pattern.symbol);
    setTimeframe(pattern.timeframe);
    syncUrl({ symbol: pattern.symbol, tf: pattern.timeframe });
    // On mobile the two panels are tabs, so choosing a pair means showing it.
    setView("chart");
  };

  return (
    <div className="flex h-dvh flex-col bg-[var(--border)]">
      {/* Below md the two panels are tabs. The nav sits outside the grid: as a
          grid child it took a cell of its own, and the aside's explicit
          row-start then won the auto-placement race and landed in column one —
          which put the screener on the left at 2/3 width and the chart on the
          right at 1/3, the exact inverse of §1. */}
      <nav className="flex shrink-0 gap-px md:hidden" aria-label="Panels">
        {(["chart", "screener"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-current={view === v}
            className={`h-11 flex-1 capitalize ${
              view === v ? "bg-bg text-text" : "bg-surface text-text-muted"
            }`}
          >
            {v}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-px md:grid-rows-[minmax(0,55vh)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-rows-1">
        <section
          className={`bg-bg min-h-0 min-w-0 overflow-hidden ${
            view === "chart" ? "" : "hidden md:block"
          }`}
        >
          <ChartPanel symbol={symbol} timeframe={timeframe} />
        </section>

        <aside
          className={`bg-surface min-h-0 min-w-0 ${
            view === "screener" ? "" : "hidden md:block"
          }`}
        >
          <ScreenerPanel
            timeframe={timeframe}
            direction={direction}
            selectedSymbol={symbol}
            onTimeframeChange={(tf) => {
              setTimeframe(tf);
              syncUrl({ tf });
            }}
            onDirectionChange={(d) => {
              setDirection(d);
              syncUrl({ dir: d });
            }}
            onSelect={selectPattern}
          />
        </aside>
      </main>
    </div>
  );
}
