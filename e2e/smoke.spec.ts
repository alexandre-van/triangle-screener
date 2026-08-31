import { expect, test } from "@playwright/test";

test("the page renders", async ({ page }) => {
  await page.goto("/");
  // The default pair, with no query string at all.
  await expect(page.getByRole("heading", { name: /BTCUSDT/ })).toBeVisible({
    timeout: 30_000,
  });
});
