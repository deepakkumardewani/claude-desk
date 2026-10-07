import { expect, test } from "./fixtures/index.js";

test.describe("Application Shell", () => {
  test("Primary navigation links are visible", async ({ page }) => {
    await page.goto("/");
    for (const name of [
      "Home",
      "Backups",
      "MCP Servers",
      "Settings",
      "Usage",
      "Discover",
      "CLAUDE.md",
      "Workspace",
    ]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
  });

  test("Scope switcher lists the seeded project", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /~\/\.claude/ }).click();
    await expect(page.getByRole("menuitem", { name: /acme-app/ })).toBeVisible();
  });

  test("User home summarizes the seeded configuration", async ({ page }) => {
    await page.goto("/user");
    await expect(page.getByRole("heading", { name: "Your user config" })).toBeVisible();
    const browse = page.getByRole("region", { name: /browse/i });
    await expect(browse).toContainText(/Skills\s*3/);
    await expect(browse).toContainText(/Plans\s*0/);
    await expect(browse).toContainText(/Commands\s*2/);
    await expect(browse).toContainText(/Agents\s*2/);
    await expect(browse).toContainText(/Plugins\s*1/);
    await expect(page.getByText("Needs attention")).toHaveCount(0);
  });

  test("Theme toggle switches between light and dark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  });

  test("Missing session token shows launch instructions", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByText("Open Claude Desk from the CLI")).toBeVisible();
      await expect(page.getByText(/launch URL contains a session token/)).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
