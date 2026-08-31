"use client";

import type { TrianglePattern } from "@/lib/patterns/triangle";
import { formatPrice } from "@/lib/format";
import { Badge } from "../ui/Badge";

export interface PairRowProps {
  pattern: TrianglePattern;
  selected: boolean;
  onSelect: (pattern: TrianglePattern) => void;
}

/**
 * "Waiting L3" is the point of the screener: H3 is confirmed and the third low
 * is the thing to watch for. For a descending pattern the mirror makes the
 * same state "waiting H3", so the label follows the direction.
 */
const statusLabel = (pattern: TrianglePattern): string => {
  if (pattern.status === "breakout") return "Breakout";
  if (pattern.status === "complete") return "Complete";
  return pattern.direction === "ascending" ? "Waiting L3" : "Waiting H3";
};

export function PairRow({ pattern, selected, onSelect }: PairRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-symbol={pattern.symbol}
      data-direction={pattern.direction}
      onClick={() => onSelect(pattern)}
      // 44px on desktop, 52px on touch — §9.
      className={`flex h-11 w-full items-center gap-3 px-3 text-left [@media(pointer:coarse)]:h-13 ${
        selected ? "bg-elevate" : "hover:bg-elevate"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{pattern.symbol}</span>

      <span className="tabular text-text-muted shrink-0">
        {formatPrice(pattern.breakoutLevel)}
      </span>

      <Badge
        tone={pattern.direction === "ascending" ? "ascending" : "descending"}
      >
        {pattern.subtype === "symmetrical"
          ? "sym"
          : pattern.direction.slice(0, 3)}
      </Badge>

      <span className="text-2xs text-text-faint w-20 shrink-0">
        {statusLabel(pattern)}
      </span>

      <span
        className={`tabular w-7 shrink-0 text-right ${
          pattern.highQuality ? "text-text" : "text-text-muted"
        }`}
        title={`Quality score ${pattern.score} of 100${pattern.highQuality ? " — high quality" : ""}`}
      >
        {Math.round(pattern.score)}
      </span>
    </button>
  );
}
