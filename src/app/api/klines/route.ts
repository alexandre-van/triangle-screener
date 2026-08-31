import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cacheTtlSeconds,
  candleLimit,
  dropForming,
  MIN_CANDLES,
} from "@/lib/exchange/candles";
import { getAdapter } from "@/lib/exchange/adapter";
import { ExchangeError, isTimeframe, TIMEFRAMES } from "@/lib/exchange/types";
import { configFor } from "@/lib/patterns/config";
import { detectTriangles } from "@/lib/patterns/triangle";

/**
 * GET /api/klines?symbol=BTCUSDT&tf=4h
 *
 * Exchange calls happen here and nowhere else — the browser never talks to an
 * exchange (PLAN.md §5.4). §8.3: the response carries the detected pattern
 * alongside the candles, so clicking a screener row is a single round trip.
 */

const query = z.object({
  // §13.2: the symbol is interpolated into an upstream URL, so it is
  // constrained before it goes anywhere near one.
  symbol: z
    .string()
    .regex(
      /^[A-Z0-9]{2,20}$/,
      "symbol must be 2-20 uppercase letters or digits",
    ),
  tf: z
    .string()
    .refine(isTimeframe, `tf must be one of: ${TIMEFRAMES.join(", ")}`),
  /** Keep the forming candle. Off by default; charts may want it. */
  forming: z
    .enum(["0", "1"])
    .optional()
    .transform((v) => v === "1"),
});

interface ErrorBody {
  error: { code: string; message: string };
}

const fail = (status: number, code: string, message: string) =>
  NextResponse.json<ErrorBody>(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );

const statusFor = (code: ExchangeError["code"]): number => {
  switch (code) {
    case "unknown_symbol":
      return 404;
    case "rate_limited":
      return 429;
    case "unreachable":
      return 504;
    default:
      return 502; // blocked, bad_response, upstream_error
  }
};

/**
 * What the client is told. §9's copy rule wants the error to say what failed
 * — "Couldn't reach Bybit" — so the provider is named. The upstream's own
 * error text is not passed through: it is written for an exchange integrator,
 * not for someone looking at a chart, and §8.4 keeps upstream detail out of
 * the response body.
 */
const messageFor = (e: ExchangeError, symbol: string): string => {
  switch (e.code) {
    case "unknown_symbol":
      return `${symbol} is not listed on ${e.provider}.`;
    case "rate_limited":
      return `${e.provider} is rate limiting requests. Try again in a moment.`;
    case "unreachable":
      return `Couldn't reach ${e.provider}.`;
    case "blocked":
      return `${e.provider} refuses requests from this region.`;
    default:
      return `${e.provider} returned an unexpected response.`;
  }
};

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = query.safeParse(params);

  if (!parsed.success) {
    return fail(
      400,
      "invalid_request",
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  }

  const { symbol, tf, forming } = parsed.data;
  const adapter = getAdapter();

  try {
    const raw = await adapter.getCandles(symbol, tf, candleLimit(tf));
    const candles = forming ? raw : dropForming(raw);

    if (candles.length < MIN_CANDLES) {
      // Many altcoins simply do not have this much history. That is not an
      // error — it means this pair is not screenable at this timeframe.
      return fail(
        422,
        "insufficient_history",
        `${symbol} has ${candles.length} closed ${tf} candles; ${MIN_CANDLES} are needed`,
      );
    }

    // Detection runs on closed candles only, whatever the caller asked for:
    // a pattern that repaints is worse than no pattern.
    const patterns = detectTriangles(dropForming(raw), {
      symbol,
      timeframe: tf,
      config: configFor(tf),
    });

    const ttl = cacheTtlSeconds(tf);
    return NextResponse.json(
      {
        symbol,
        timeframe: tf,
        provider: adapter.name,
        count: candles.length,
        candles,
        patterns,
      },
      {
        headers: {
          "cache-control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
        },
      },
    );
  } catch (e) {
    if (e instanceof ExchangeError) {
      return fail(statusFor(e.code), e.code, messageFor(e, symbol));
    }
    return fail(500, "internal_error", "Something went wrong loading candles.");
  }
}
