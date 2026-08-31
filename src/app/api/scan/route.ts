import { z } from "zod";
import { getAdapter } from "@/lib/exchange/adapter";
import { ExchangeError, isTimeframe, TIMEFRAMES } from "@/lib/exchange/types";
import { getUniverse, readUniverseOptions } from "@/lib/scan/universe";
import { scan } from "@/lib/scan/scanner";

/**
 * GET /api/scan?tf=4h&direction=ascending
 *
 * §8.2: a cold 200-pair scan takes 25-60 seconds, which is too slow for a
 * request/response cycle. The body is newline-delimited JSON — one object per
 * pair as it completes — so the panel fills in progressively and the function
 * never buffers the whole scan.
 */

const query = z.object({
  tf: z
    .string()
    .refine(isTimeframe, `tf must be one of: ${TIMEFRAMES.join(", ")}`),
  direction: z.enum(["all", "ascending", "descending"]).default("all"),
  minScore: z.coerce.number().min(0).max(100).optional(),
});

const fail = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

export async function GET(request: Request): Promise<Response> {
  const parsed = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return fail(
      400,
      "invalid_request",
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  }

  const adapter = getAdapter();
  let universe;
  try {
    universe = await getUniverse(adapter, readUniverseOptions());
  } catch (e) {
    const code = e instanceof ExchangeError ? e.code : "internal_error";
    return fail(
      code === "rate_limited" ? 429 : 502,
      code,
      `Couldn't reach ${adapter.name}.`,
    );
  }

  const encoder = new TextEncoder();
  const events = scan(adapter, universe, {
    timeframe: parsed.data.tf,
    direction: parsed.data.direction,
    minScore: parsed.data.minScore,
    signal: request.signal,
  });

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await events.next();
        if (next.done === true) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
      } catch {
        // The client hung up, or the generator threw. Either way the stream
        // ends; there is no status code left to change at this point.
        controller.close();
      }
    },
    cancel() {
      void events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Vercel and some proxies buffer by default, which would defeat the
      // whole point of streaming.
      "x-accel-buffering": "no",
    },
  });
}
