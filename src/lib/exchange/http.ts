import { ZodError, type ZodType } from "zod";
import { ExchangeError } from "./types";

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * The only way this layer talks to the outside world. Every response is parsed
 * by a Zod schema before it is returned — PLAN.md §5.1 — and every failure
 * comes back as a typed ExchangeError rather than an exception from three
 * libraries down.
 */
export const fetchJson = async <T>(
  provider: string,
  url: string,
  schema: ZodType<T>,
  init?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json" },
      signal:
        init?.signal ??
        AbortSignal.timeout(init?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new ExchangeError(
      "unreachable",
      provider,
      `could not reach ${provider}`,
      { cause },
    );
  }

  if (!res.ok) {
    // 403 and 451 are the geo-block pair: Bybit fronts CloudFront and answers
    // 403 outside its permitted regions, Binance answers 451. Neither is worth
    // retrying — the region will not change.
    if (res.status === 403 || res.status === 451) {
      throw new ExchangeError(
        "blocked",
        provider,
        `${provider} refuses requests from this region`,
        { status: res.status },
      );
    }
    if (res.status === 429) {
      throw new ExchangeError(
        "rate_limited",
        provider,
        `${provider} rate limited`,
        {
          status: res.status,
        },
      );
    }
    throw new ExchangeError(
      "upstream_error",
      provider,
      `${provider} returned ${res.status}`,
      { status: res.status },
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new ExchangeError(
      "bad_response",
      provider,
      `${provider} sent non-JSON`,
      {
        status: res.status,
        cause,
      },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ExchangeError(
      "bad_response",
      provider,
      `${provider} response failed its schema: ${summarise(parsed.error)}`,
      { status: res.status, cause: parsed.error },
    );
  }
  return parsed.data;
};

/** First few issues only — the whole tree is unreadable in a log line. */
const summarise = (error: ZodError): string =>
  error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");

/** Every numeric field on every exchange arrives as a string. */
export const toNumber = (
  provider: string,
  field: string,
  raw: string,
): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new ExchangeError(
      "bad_response",
      provider,
      `${provider} sent a non-numeric ${field}: ${JSON.stringify(raw)}`,
    );
  }
  return n;
};

/**
 * Parse a value that has already arrived, throwing the same typed error as
 * fetchJson. Needed where a provider reports business failures inside the
 * envelope: the status code must be read before the payload is validated,
 * because an error response carries no payload to validate.
 */
export const parseOrThrow = <T>(
  provider: string,
  what: string,
  schema: ZodType<T>,
  value: unknown,
): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ExchangeError(
      "bad_response",
      provider,
      `${provider} ${what} failed its schema: ${summarise(parsed.error)}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
};
