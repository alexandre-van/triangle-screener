"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import type { Timeframe } from "@/lib/exchange/types";
import { formatPrice } from "@/lib/format";
import type { ApiError, KlinesResponse } from "@/types/api";

// §14: lightweight-charts touches the DOM and is ~45KB gzipped, so it is
// loaded on the client only and kept out of the initial bundle.
const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <Centered>Loading chart…</Centered>,
});

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div className="text-text-muted flex h-full items-center justify-center p-6 text-center">
    {children}
  </div>
);

const fetchKlines = async (
  symbol: string,
  tf: Timeframe,
): Promise<KlinesResponse> => {
  const res = await fetch(`/api/klines?symbol=${symbol}&tf=${tf}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error.message ?? `Couldn't load ${symbol}.`);
  }
  return res.json() as Promise<KlinesResponse>;
};

export interface ChartPanelProps {
  symbol: string;
  timeframe: Timeframe;
}

export function ChartPanel({ symbol, timeframe }: ChartPanelProps) {
  const { data, error, isPending } = useQuery({
    queryKey: ["klines", symbol, timeframe],
    queryFn: () => fetchKlines(symbol, timeframe),
  });

  if (isPending) return <Centered>Loading {symbol}…</Centered>;
  if (error) return <Centered>{error.message}</Centered>;

  const pattern = data.patterns[0];
  const last = data.candles[data.candles.length - 1];

  return (
    <div className="flex h-full flex-col">
      <header className="border-border flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-4 py-3">
        <h1 className="text-base">
          {symbol} <span className="text-text-muted">· {timeframe}</span>
        </h1>
        <span className="tabular text-lg">{formatPrice(last.close)}</span>
        {pattern === undefined ? (
          <span className="text-text-faint">
            No triangle on this timeframe.
          </span>
        ) : (
          <span className="text-text-muted flex items-center gap-2">
            <span>
              {pattern.direction}
              {pattern.subtype === "symmetrical" ? " · symmetrical" : ""}
            </span>
            <span className="text-text-faint">{pattern.status}</span>
            <span
              className="tabular border-border rounded-sm border px-1.5 py-0.5"
              title={`Quality score ${pattern.score} of 100`}
            >
              {Math.round(pattern.score)}
            </span>
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1">
        <PriceChart candles={data.candles} pattern={pattern} />
      </div>
    </div>
  );
}
