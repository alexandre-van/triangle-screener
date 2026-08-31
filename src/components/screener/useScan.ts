"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Timeframe } from "@/lib/exchange/types";
import type { TrianglePattern } from "@/lib/patterns/triangle";
import { splitNdjson } from "@/lib/scan/ndjson";
import type { DirectionFilter, ScanEvent } from "@/lib/scan/scanner";

export interface ScanState {
  results: TrianglePattern[];
  done: number;
  total: number;
  running: boolean;
  error?: string;
}

const INITIAL: ScanState = { results: [], done: 0, total: 0, running: false };

/**
 * Reads the newline-delimited stream from /api/scan, appending rows as they
 * arrive (§8.2). A cold scan takes 25-60 seconds; buffering it would make the
 * panel look broken for a minute.
 */
export const useScan = (timeframe: Timeframe, direction: DirectionFilter) => {
  const [state, setState] = useState<ScanState>(INITIAL);
  const abortRef = useRef<AbortController>(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...INITIAL, running: true });

    try {
      const res = await fetch(
        `/api/scan?tf=${timeframe}&direction=${direction}`,
        {
          signal: controller.signal,
        },
      );
      if (!res.ok || res.body === null) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Couldn't start the scan.");
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const { events, rest } = splitNdjson(buffer, value);
        buffer = rest;
        for (const event of events) applyEvent(setState, event);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setState((s) => ({
        ...s,
        running: false,
        error: e instanceof Error ? e.message : "The scan failed.",
      }));
      return;
    }
    setState((s) => ({ ...s, running: false }));
  }, [timeframe, direction]);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  return { ...state, rescan: run };
};

const applyEvent = (
  setState: React.Dispatch<React.SetStateAction<ScanState>>,
  event: ScanEvent,
): void => {
  setState((s) => {
    switch (event.type) {
      case "start":
        return { ...s, total: event.total };
      case "hit":
        return {
          ...s,
          done: event.done,
          // Results arrive in completion order, so keep the list sorted by
          // score as it fills rather than reshuffling at the end.
          results: [...s.results, event.pattern].sort(
            (a, b) => b.score - a.score,
          ),
        };
      case "miss":
      case "error":
        return { ...s, done: event.done };
      case "done":
        return { ...s, done: event.scanned, running: false };
    }
  });
};
