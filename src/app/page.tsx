import { Workspace } from "@/components/Workspace";
import { isTimeframe, type Timeframe } from "@/lib/exchange/types";
import type { DirectionFilter } from "@/lib/scan/scanner";

const DEFAULT_SYMBOL = "BTCUSDT";
const DEFAULT_TIMEFRAME: Timeframe = "1d";

const isDirection = (v: string): v is DirectionFilter =>
  v === "all" || v === "ascending" || v === "descending";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? params[k] : "");

  const rawSymbol = one("symbol").toUpperCase();
  const rawTf = one("tf");
  const rawDir = one("dir");

  return (
    <Workspace
      initialSymbol={
        /^[A-Z0-9]{2,20}$/.test(rawSymbol) ? rawSymbol : DEFAULT_SYMBOL
      }
      initialTimeframe={isTimeframe(rawTf) ? rawTf : DEFAULT_TIMEFRAME}
      initialDirection={isDirection(rawDir) ? rawDir : "all"}
    />
  );
}
