import { describe, expect, it } from "vitest";
import { splitNdjson } from "./ndjson";

const line = (o: unknown) => `${JSON.stringify(o)}\n`;

describe("splitNdjson", () => {
  it("reads whole lines and keeps nothing back", () => {
    const chunk =
      line({ type: "miss", done: 1, symbol: "A" }) +
      line({ type: "miss", done: 2, symbol: "B" });
    const { events, rest } = splitNdjson("", chunk);
    expect(events).toHaveLength(2);
    expect(rest).toBe("");
  });

  it("carries a partial line into the next chunk", () => {
    const whole = line({ type: "miss", done: 1, symbol: "BTCUSDT" });
    const cut = Math.floor(whole.length / 2);

    const first = splitNdjson("", whole.slice(0, cut));
    expect(first.events).toHaveLength(0);
    expect(first.rest).toBe(whole.slice(0, cut));

    const second = splitNdjson(first.rest, whole.slice(cut));
    expect(second.events).toEqual([
      { type: "miss", done: 1, symbol: "BTCUSDT" },
    ]);
    expect(second.rest).toBe("");
  });

  it("survives a boundary falling on every single byte of an event", () => {
    const whole = line({
      type: "hit",
      done: 3,
      pattern: { symbol: "ETHUSDT" },
    });
    for (let cut = 0; cut < whole.length; cut++) {
      const a = splitNdjson("", whole.slice(0, cut));
      const b = splitNdjson(a.rest, whole.slice(cut));
      expect([...a.events, ...b.events], `cut at ${cut}`).toHaveLength(1);
    }
  });

  it("ignores blank lines", () => {
    const { events } = splitNdjson(
      "",
      `\n\n${line({ type: "done", scanned: 1, hits: 0 })}\n`,
    );
    expect(events).toHaveLength(1);
  });

  it("skips a line that will not parse rather than throwing", () => {
    const { events } = splitNdjson(
      "",
      `{not json}\n${line({ type: "done", scanned: 1, hits: 0 })}`,
    );
    expect(events).toHaveLength(1);
  });

  it("returns nothing for an empty chunk", () => {
    expect(splitNdjson("", "")).toEqual({ events: [], rest: "" });
  });
});
