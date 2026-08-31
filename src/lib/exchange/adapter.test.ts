import { describe, expect, it } from "vitest";
import { createAdapter, DEFAULT_CONFIG, readConfig } from "./adapter";

describe("readConfig", () => {
  it("defaults to OKX spot — the only provider that answers from a US IP", () => {
    expect(readConfig({})).toEqual(DEFAULT_CONFIG);
    expect(readConfig({}).provider).toBe("okx");
  });

  it("selects bybit when asked", () => {
    expect(readConfig({ EXCHANGE_PROVIDER: "bybit" }).provider).toBe("bybit");
  });

  it("ignores case and stray whitespace", () => {
    expect(readConfig({ EXCHANGE_PROVIDER: " BYBIT " }).provider).toBe("bybit");
  });

  it("falls back rather than throwing on an unknown provider", () => {
    expect(readConfig({ EXCHANGE_PROVIDER: "ftx" }).provider).toBe("okx");
  });

  it("switches both providers to derivatives together", () => {
    const c = readConfig({ EXCHANGE_MARKET: "perp" });
    expect(c.okxInstType).toBe("SWAP");
    expect(c.bybitCategory).toBe("linear");
  });

  it("treats spot as the default market", () => {
    const c = readConfig({ EXCHANGE_MARKET: "spot" });
    expect(c.okxInstType).toBe("SPOT");
    expect(c.bybitCategory).toBe("spot");
  });
});

describe("createAdapter", () => {
  it("names the provider and market it is actually talking to", () => {
    expect(createAdapter(readConfig({})).name).toBe("okx:spot");
    expect(createAdapter(readConfig({ EXCHANGE_MARKET: "perp" })).name).toBe(
      "okx:swap",
    );
    expect(createAdapter(readConfig({ EXCHANGE_PROVIDER: "bybit" })).name).toBe(
      "bybit:spot",
    );
    expect(
      createAdapter(
        readConfig({ EXCHANGE_PROVIDER: "bybit", EXCHANGE_MARKET: "perp" }),
      ).name,
    ).toBe("bybit:linear");
  });
});
