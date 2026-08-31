"use client";

import { useRef, useState } from "react";
import type { Timeframe } from "@/lib/exchange/types";
import type { TrianglePattern } from "@/lib/patterns/triangle";
import type { DirectionFilter as DirectionValue } from "@/lib/scan/scanner";
import { EmptyState } from "../ui/EmptyState";
import { DirectionFilter } from "./DirectionFilter";
import { PairRow } from "./PairRow";
import { TimeframeSelect } from "./TimeframeSelect";
import { useScan } from "./useScan";

export interface ScreenerPanelProps {
  timeframe: Timeframe;
  direction: DirectionValue;
  selectedSymbol: string;
  onTimeframeChange: (tf: Timeframe) => void;
  onDirectionChange: (d: DirectionValue) => void;
  onSelect: (pattern: TrianglePattern) => void;
}

export function ScreenerPanel({
  timeframe,
  direction,
  selectedSymbol,
  onTimeframeChange,
  onDirectionChange,
  onSelect,
}: ScreenerPanelProps) {
  const { results, done, total, running, error, rescan } = useScan(
    timeframe,
    direction,
  );
  const listRef = useRef<HTMLDivElement>(null);

  // The cursor belongs to one filter combination. Storing which one it belongs
  // to lets it reset during render when the filters change, instead of in an
  // effect — an effect here fires a second render pass on every filter change.
  const filterKey = `${timeframe}:${direction}`;
  const [cursorFor, setCursorFor] = useState({ key: filterKey, index: 0 });
  const cursor = cursorFor.key === filterKey ? cursorFor.index : 0;
  const setCursor = (index: number) => setCursorFor({ key: filterKey, index });

  // §10: up/down move through the list, Enter loads the chart.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(
        results.length - 1,
        Math.max(0, cursor + (e.key === "ArrowDown" ? 1 : -1)),
      );
      setCursor(next);
      listRef.current
        ?.querySelectorAll<HTMLElement>('[role="option"]')
        [next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      onSelect(results[cursor]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex gap-3 border-b p-3">
        <TimeframeSelect value={timeframe} onChange={onTimeframeChange} />
        <DirectionFilter value={direction} onChange={onDirectionChange} />
      </div>

      <div className="border-border flex items-baseline justify-between border-b px-3 py-2">
        <span className="tabular text-2xs text-text-faint">
          {running
            ? `${done} / ${total} pairs scanned`
            : `${results.length} found`}
        </span>
        <button
          type="button"
          onClick={() => void rescan()}
          disabled={running}
          className="text-2xs text-text-muted hover:text-text disabled:text-text-faint"
        >
          {running ? "Scanning…" : "Rescan"}
        </button>
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="Pairs with a triangle"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {error !== undefined ? (
          <EmptyState>{error}</EmptyState>
        ) : results.length === 0 && !running ? (
          <EmptyState>
            No triangles forming on {timeframe} right now. Try a higher
            timeframe or switch direction.
          </EmptyState>
        ) : (
          results.map((p, i) => (
            <div
              key={`${p.symbol}-${p.direction}`}
              className="animate-row border-border border-b"
            >
              <PairRow
                pattern={p}
                selected={p.symbol === selectedSymbol || i === cursor}
                onSelect={onSelect}
              />
            </div>
          ))
        )}
        {running && results.length === 0 ? (
          <EmptyState>Scanning {total} pairs…</EmptyState>
        ) : null}
      </div>
    </div>
  );
}
