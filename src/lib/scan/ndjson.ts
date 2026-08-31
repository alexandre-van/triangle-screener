import type { ScanEvent } from "./scanner";

/**
 * Splits a newline-delimited JSON stream into events.
 *
 * A chunk boundary lands wherever the network puts it, which is routinely
 * mid-object, so the trailing partial line is carried into the next chunk
 * rather than parsed. Getting this wrong drops roughly one event per chunk and
 * the symptom — a scan that reports fewer pairs than it walked — looks like a
 * bug in the scanner.
 */
export interface NdjsonSplit {
  events: ScanEvent[];
  /** Whatever is left over, to prepend to the next chunk. */
  rest: string;
}

export const splitNdjson = (buffer: string, chunk: string): NdjsonSplit => {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  const rest = lines.pop() ?? "";

  const events: ScanEvent[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    try {
      events.push(JSON.parse(line) as ScanEvent);
    } catch {
      // A line that will not parse is a truncated stream, not something the
      // panel can act on. Skip it rather than killing the whole scan.
    }
  }
  return { events, rest };
};
