import { ChartPanel } from "@/components/chart/ChartPanel";
import { isTimeframe, type Timeframe } from "@/lib/exchange/types";

const DEFAULT_SYMBOL = "BTCUSDT";
const DEFAULT_TIMEFRAME: Timeframe = "1d";

/**
 * §10: the selected pair and timeframe live in the URL, so a chart view is
 * linkable and survives a refresh. The screener panel arrives in Phase 5.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawSymbol =
    typeof params.symbol === "string" ? params.symbol.toUpperCase() : "";
  const symbol = /^[A-Z0-9]{2,20}$/.test(rawSymbol)
    ? rawSymbol
    : DEFAULT_SYMBOL;
  const rawTf = typeof params.tf === "string" ? params.tf : "";
  const timeframe = isTimeframe(rawTf) ? rawTf : DEFAULT_TIMEFRAME;

  return (
    /* Every track is minmax(0, ...) and every child min-w-0. Without that the
       grid sizes its column to content, and lightweight-charts sets an
       explicit pixel width on its own DOM — so the column can never shrink
       below whatever width the chart was created at, the container never
       changes size, and the ResizeObserver never fires. The chart appears to
       ignore the viewport entirely. */
    <main className="grid h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto] gap-px bg-[var(--border)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-rows-1">
      <section className="bg-bg min-h-0 min-w-0 overflow-hidden">
        <ChartPanel symbol={symbol} timeframe={timeframe} />
      </section>
      <aside className="bg-surface flex flex-col gap-3 p-4 xl:overflow-y-auto">
        <h2 className="text-sm">Screener</h2>
        <p className="text-text-muted">
          The pair list arrives in Phase 5. For now, set{" "}
          <code className="text-text-faint">?symbol=ETHUSDT&amp;tf=4h</code> in
          the URL.
        </p>
      </aside>
    </main>
  );
}
