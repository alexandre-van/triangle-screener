import type { PatternPivot, TrianglePattern } from "@/lib/patterns/triangle";

export interface PivotMarker {
  label: string;
  pivot: PatternPivot;
  /** Highs are labelled above the marker, lows below. */
  side: "above" | "below";
}

/**
 * The six markers in time order, labelled.
 *
 * §6.9: a descending pattern's pivots run L1, H1, L2, H2, L3, H3 — the low
 * comes first, because it was found on the mirrored series where that low was
 * a high. Labelling by position alone would print H1 on a low.
 */
export const pivotMarkers = (pattern: TrianglePattern): PivotMarker[] => {
  const { h1, l1, h2, l2, h3, l3 } = pattern.pivots;
  const labelled: Array<[string, PatternPivot | undefined]> = [
    ["H1", h1],
    ["L1", l1],
    ["H2", h2],
    ["L2", l2],
    ["H3", h3],
    ["L3", l3],
  ];

  return labelled
    .flatMap(([label, pivot]) =>
      pivot === undefined
        ? []
        : [
            {
              label,
              pivot,
              side: label.startsWith("H")
                ? ("above" as const)
                : ("below" as const),
            },
          ],
    )
    .sort((a, b) => a.pivot.index - b.pivot.index);
};
