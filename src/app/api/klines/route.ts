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

/**
 * GET /api/klines?symbol=BTCUSDT&tf=4h
 *
 * Exchange calls happen here and nowhere else — the browser never talks to an
 * exchange (PLAN.md §5.4). The detected pattern joins this response in Phase 3.
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

/** Never leak the upstream URL or a stack trace to the client (§8.4). */
const statusFor = (code: ExchangeError["code"]): number => {
  switch (code) {
    case "rate_limited":
      return 429;
    case "blocked":
      return 502;
    case "unreachable":
      return 504;
    default:
      return 502;
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

    const ttl = cacheTtlSeconds(tf);
    return NextResponse.json(
      {
        symbol,
        timeframe: tf,
        provider: adapter.name,
        count: candles.length,
        candles,
      },
      {
        headers: {
          "cache-control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
        },
      },
    );
  } catch (e) {
    if (e instanceof ExchangeError) {
      return fail(statusFor(e.code), e.code, e.message);
    }
    return fail(500, "internal_error", "Something went wrong loading candles.");
  }
}
