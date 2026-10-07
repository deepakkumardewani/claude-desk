import { expect, test } from "./fixtures/index.js";

test("app loads on the isolated server with the seeded project", async ({ page }) => {
  await page.goto("/");
  const switcher = page.getByRole("button", { name: /~\/\.claude/ });
  await expect(switcher).toBeVisible();
  await switcher.click();
  await expect(page.getByRole("menuitem", { name: /acme-app/ })).toBeVisible();
});
