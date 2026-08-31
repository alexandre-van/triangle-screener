import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { TrianglePattern } from "@/lib/patterns/triangle";
import { valueAt } from "@/lib/patterns/trendline";
import { pivotMarkers } from "./pivotMarkers";
import {
  CHART,
  PIVOT_MARKER_RADIUS,
  PROJECTION_BARS,
  TRENDLINE_WIDTH,
} from "./theme";

interface Screen {
  x: number;
  y: number;
}

interface Geometry {
  resistance: { solid: [Screen, Screen]; projected: [Screen, Screen] };
  support: { solid: [Screen, Screen]; projected: [Screen, Screen] };
  markers: Array<{ point: Screen; label: string; side: "above" | "below" }>;
  pole?: { fromX: number; toX: number };
}

/**
 * Everything the pattern draws on the chart: the two trendlines, the six
 * labelled pivots, and the pole band.
 *
 * Projection past the last pivot is dashed (§9), which is why each line is
 * split into a solid and a projected segment.
 */
export class TrianglePrimitive implements ISeriesPrimitive<Time> {
  private pattern: TrianglePattern;
  private chart?: IChartApi;
  private series?: ISeriesApi<SeriesType, Time>;
  private geometry?: Geometry;
  private readonly paneView: IPrimitivePaneView;
  private readonly backgroundView: IPrimitivePaneView;

  constructor(pattern: TrianglePattern) {
    this.pattern = pattern;
    this.paneView = {
      zOrder: () => "top",
      renderer: (): IPrimitivePaneRenderer => ({
        draw: (target) => {
          const g = this.geometry;
          if (g === undefined) return;
          target.useMediaCoordinateSpace(({ context }) =>
            drawPattern(context, g),
          );
        },
      }),
    };
    this.backgroundView = {
      zOrder: () => "bottom",
      renderer: (): IPrimitivePaneRenderer => ({
        draw: (target) => {
          const pole = this.geometry?.pole;
          if (pole === undefined) return;
          target.useMediaCoordinateSpace(({ context, mediaSize }) => {
            context.fillStyle = CHART.poleBand;
            context.fillRect(
              pole.fromX,
              0,
              pole.toX - pole.fromX,
              mediaSize.height,
            );
          });
        },
      }),
    };
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart;
    this.series = param.series;
  }

  detached(): void {
    this.chart = undefined;
    this.series = undefined;
  }

  setPattern(pattern: TrianglePattern): void {
    this.pattern = pattern;
    this.updateAllViews();
  }

  updateAllViews(): void {
    this.geometry = this.computeGeometry();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.backgroundView, this.paneView];
  }

  private computeGeometry(): Geometry | undefined {
    const chart = this.chart;
    const series = this.series;
    if (chart === undefined || series === undefined) return undefined;

    const timeScale = chart.timeScale();
    // Logical coordinates, not times: the projection has to reach past the
    // last bar, where no timestamp exists yet.
    const at = (barIndex: number, price: number): Screen | undefined => {
      const x = timeScale.logicalToCoordinate(barIndex as Logical);
      const y = series.priceToCoordinate(price);
      return x === null || y === null ? undefined : { x, y };
    };

    const p = this.pattern;
    const pivots = [
      p.pivots.h1,
      p.pivots.l1,
      p.pivots.h2,
      p.pivots.l2,
      p.pivots.h3,
      p.pivots.l3,
    ];
    const present = pivots.filter((x) => x !== undefined);
    if (present.length === 0) return undefined;

    const firstIndex = Math.min(...present.map((x) => x.index));
    const lastIndex = Math.max(...present.map((x) => x.index));
    const endIndex = Math.min(
      lastIndex + PROJECTION_BARS,
      p.apexBarIndex === undefined
        ? lastIndex + PROJECTION_BARS
        : Math.round(p.apexBarIndex),
    );

    const highs = [p.pivots.h1, p.pivots.h2, p.pivots.h3].filter(
      (x) => x !== undefined,
    );
    const lows = [p.pivots.l1, p.pivots.l2, p.pivots.l3].filter(
      (x) => x !== undefined,
    );

    /**
     * A trendline is drawn between its own touch points, then projected
     * forward. Spanning it from the pattern's first pivot instead sends
     * resistance shooting off the top of the chart on any descending pattern,
     * where the first pivot is a low.
     */
    const segment = (line: typeof p.resistance, touches: typeof highs) => {
      if (touches.length === 0) return undefined;
      const from = Math.min(...touches.map((t) => t.index));
      const to = Math.max(...touches.map((t) => t.index));
      const a = at(from, valueAt(line, from));
      const b = at(to, valueAt(line, to));
      const c = at(endIndex, valueAt(line, endIndex));
      return a === undefined || b === undefined || c === undefined
        ? undefined
        : {
            solid: [a, b] as [Screen, Screen],
            projected: [b, c] as [Screen, Screen],
          };
    };

    const resistance = segment(p.resistance, highs);
    const support = segment(p.support, lows);
    if (resistance === undefined || support === undefined) return undefined;

    const markers = pivotMarkers(p)
      .map((m) => {
        const point = at(m.pivot.index, m.pivot.price);
        return point === undefined
          ? undefined
          : { point, label: m.label, side: m.side };
      })
      .filter((m) => m !== undefined);

    let pole: Geometry["pole"];
    const poleStart = p.pivots.pole;
    if (poleStart !== undefined) {
      const fromX = timeScale.logicalToCoordinate(poleStart.index as Logical);
      const toX = timeScale.logicalToCoordinate(firstIndex as Logical);
      if (fromX !== null && toX !== null) pole = { fromX, toX };
    }

    return { resistance, support, markers, pole };
  }
}

const strokeSegment = (
  context: CanvasRenderingContext2D,
  [a, b]: [Screen, Screen],
  color: string,
  dashed: boolean,
): void => {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = TRENDLINE_WIDTH;
  context.setLineDash(dashed ? [6, 5] : []);
  context.beginPath();
  context.moveTo(a.x, a.y);
  context.lineTo(b.x, b.y);
  context.stroke();
  context.restore();
};

const drawPattern = (context: CanvasRenderingContext2D, g: Geometry): void => {
  // Resistance is the accent red, support the amber (§9). Under the mirror
  // the roles are already un-swapped by the detector, so this holds for
  // descending patterns too.
  strokeSegment(context, g.resistance.solid, CHART.accent, false);
  strokeSegment(context, g.resistance.projected, CHART.accent, true);
  strokeSegment(context, g.support.solid, CHART.text, false);
  strokeSegment(context, g.support.projected, CHART.text, true);

  context.save();
  context.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  for (const { point, label, side } of g.markers) {
    context.fillStyle = CHART.text;
    context.beginPath();
    context.arc(point.x, point.y, PIVOT_MARKER_RADIUS, 0, Math.PI * 2);
    context.fill();

    // Highs get their label above the marker, lows below, so a label never
    // sits on top of the price action it is describing.
    const above = side === "above";
    context.fillStyle = CHART.textMuted;
    context.textBaseline = above ? "bottom" : "top";
    context.fillText(label, point.x, point.y + (above ? -7 : 7));
  }
  context.restore();
};
