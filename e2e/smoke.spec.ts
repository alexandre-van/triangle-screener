import { expect, test } from "@playwright/test";

test("the page renders", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Triangle screener" }),
  ).toBeVisible();
});
