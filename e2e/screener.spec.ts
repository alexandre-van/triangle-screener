import { expect, test } from "@playwright/test";

test("streams rows in and loads a pair into the chart on click", async ({
  page,
}) => {
  await page.goto("/?symbol=BTCUSDT&tf=1d");

  const list = page.getByRole("listbox", { name: "Pairs with a triangle" });
  await expect(list).toBeVisible();

  // §14: the first result must be visible within a couple of seconds, which is
  // the whole point of streaming rather than buffering the scan.
  const firstRow = list.getByRole("option").first();
  await expect(firstRow).toBeVisible({ timeout: 20_000 });

  // The progress counter moves while the scan runs.
  await expect(
    page.getByText(/\d+ \/ \d+ pairs scanned|\d+ found/),
  ).toBeVisible();

  const symbol = (await firstRow.getAttribute("data-symbol")) ?? "";
  expect(symbol).toMatch(/^[A-Z0-9]{2,20}$/);

  await firstRow.click();

  // Clicking loads that pair into the chart and into the URL (§10).
  await expect(
    page.getByRole("heading", { name: new RegExp(symbol) }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(new RegExp(`symbol=${symbol}`));
});

test("filters are keyboard reachable and the list is navigable", async ({
  page,
}) => {
  await page.goto("/?symbol=BTCUSDT&tf=1d");

  await expect(page.getByLabel("Timeframe")).toBeVisible();
  await expect(page.getByLabel("Direction")).toBeVisible();

  const list = page.getByRole("listbox", { name: "Pairs with a triangle" });
  await expect(list.getByRole("option").first()).toBeVisible({
    timeout: 20_000,
  });

  // Wait for the scan to settle: results re-sort by score as they stream in,
  // so "the second row" is not a stable target while it is still running.
  await expect(page.getByText(/^\d+ found$/)).toBeVisible({ timeout: 60_000 });

  await list.focus();
  await page.keyboard.press("ArrowDown");
  await expect(list.getByRole("option").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("changing the direction filter rescans", async ({ page }) => {
  await page.goto("/?symbol=BTCUSDT&tf=1d");
  const list = page.getByRole("listbox", { name: "Pairs with a triangle" });
  await expect(list.getByRole("option").first()).toBeVisible({
    timeout: 20_000,
  });

  await page.getByLabel("Direction").selectOption("ascending");
  await expect(page).toHaveURL(/dir=ascending/);

  // Every row that survives is ascending — the badge carries a ▲.
  await expect(list.getByRole("option").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/^\d+ found$/)).toBeVisible({ timeout: 60_000 });

  // Guard against the vacuous pass: count the rows that carry the attribute at
  // all before asserting none of them is descending.
  const all = await list.locator("[data-direction]").count();
  expect(all).toBeGreaterThan(0);
  expect(await list.locator('[data-direction="descending"]').count()).toBe(0);
  expect(await list.locator('[data-direction="ascending"]').count()).toBe(all);
});
