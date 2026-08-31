import { expect, test } from "@playwright/test";

test("renders a candlestick chart with the detected triangle", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") failures.push(m.text());
  });

  await page.goto("/?symbol=ETHUSDT&tf=1d");

  // The header renders from the API response, so this waiting also proves the
  // route answered.
  await expect(page.getByRole("heading", { name: /ETHUSDT/ })).toBeVisible({
    timeout: 30_000,
  });

  // lightweight-charts draws into canvases inside the container.
  const chart = page.getByTestId("price-chart");
  await expect(chart).toBeVisible();
  await expect(chart.locator("canvas").first()).toBeVisible({
    timeout: 30_000,
  });

  const box = await chart.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  expect(box?.height ?? 0).toBeGreaterThan(200);

  await page.screenshot({
    path: "playwright-report/chart.png",
    fullPage: false,
  });
  expect(failures, `console errors: ${failures.join(" | ")}`).toEqual([]);
});

test("the chart resizes with its container", async ({ page }) => {
  await page.goto("/?symbol=BTCUSDT&tf=1d");
  const chart = page.getByTestId("price-chart");
  await expect(chart.locator("canvas").first()).toBeVisible({
    timeout: 30_000,
  });

  const paneWidth = () =>
    chart
      .locator("canvas")
      .first()
      .evaluate((c) => (c as HTMLCanvasElement).getBoundingClientRect().width);

  const before = await paneWidth();
  expect(before).toBeGreaterThan(0);

  await page.setViewportSize({ width: 700, height: 900 });

  // lightweight-charts does not resize itself — CLAUDE.md. If the
  // ResizeObserver were missing the canvas would keep its original width
  // forever, so this is the assertion that proves it is wired up.
  await expect(async () => {
    expect(await paneWidth()).not.toBeCloseTo(before, 0);
  }).toPass({ timeout: 10_000 });

  // The pane canvas is narrower than its container by the price scale, so it
  // tracks the container rather than matching it exactly.
  const container = (await chart.boundingBox())?.width ?? 0;
  const after = await paneWidth();
  expect(after).toBeLessThan(container);
  expect(after).toBeGreaterThan(container * 0.7);
});
