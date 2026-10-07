import { expect, test } from "./fixtures/index.js";

test.describe("Workspace Scopes", () => {
  test("Workspace page shows user scope by default", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Context" })).toBeVisible();
    await expect(page.getByText("User (~/.claude)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh context summary" })).toBeVisible();
  });

  test("Switching to the project scope opens the project workspace", async ({ page }) => {
    await page.goto("/user");
    await page.getByRole("button", { name: /~\/\.claude/ }).click();
    await page.getByRole("menuitem", { name: /acme-app/ }).click();
    await expect(page).toHaveURL(/\/project\/[^/]+/);
    await expect(page.getByRole("button", { name: /acme-app/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Skills 0/ })).toBeVisible();
  });

  test("Project workspace context names the project", async ({ page }) => {
    await page.goto("/user");
    await page.getByRole("button", { name: /~\/\.claude/ }).click();
    await page.getByRole("menuitem", { name: /acme-app/ }).click();
    await expect(page).toHaveURL(/\/project\/[^/]+/);
    await page.getByRole("link", { name: "Workspace", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Context" })).toBeVisible();
    await expect(page.getByText("acme-app", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Memory files/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "User · CLAUDE.md" })).toContainText(
      "1,000",
    );
  });
});
