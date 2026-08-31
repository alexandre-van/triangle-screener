"use client";

import type { TrianglePattern } from "@/lib/patterns/triangle";
import { formatPrice } from "@/lib/format";
import { Badge } from "../ui/Badge";

export interface PairRowProps {
  pattern: TrianglePattern;
  selected: boolean;
  onSelect: (pattern: TrianglePattern) => void;
}

const STATUS_LABEL: Record<TrianglePattern["status"], string> = {
  forming: "Forming",
  h3_formed: "H3 in",
  complete: "Complete",
  breakout: "Breakout",
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

      <span className="text-2xs text-text-faint w-16 shrink-0">
        {STATUS_LABEL[pattern.status]}
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
