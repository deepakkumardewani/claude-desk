import { access } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { e2eHome, stubLog } from "./fixtures/helpers.js";
import { expect, resetHome, test } from "./fixtures/index.js";

const SKILL_DIR = () => join(e2eHome(), ".claude/skills/skill-creator");
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

async function exploreRepo(page: Page): Promise<void> {
  await page.goto("/discover");
  await page.getByRole("tab", { name: "GitHub repo" }).click();
  await page.getByRole("textbox", { name: "GitHub repository" }).fill("anthropics/skills");
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(page.getByText("skill-creator", { exact: true }).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.beforeAll(resetHome);

test.describe("Discover", () => {
  test("Exploring a GitHub repo lists its skills", async ({ page }) => {
    await exploreRepo(page);
    await expect(page.getByText("anthropics/skills").first()).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Select skill-creator" })).toBeVisible();
  });

  test("Installing a skill to user scope writes it to disk", async ({ page }) => {
    await exploreRepo(page);
    await page.getByRole("checkbox", { name: "Select skill-creator" }).check();
    await page
      .getByTestId("selection-footer")
      .getByRole("button", { name: /Install/ })
      .click();
    const dialog = page.getByRole("dialog", { name: /Install 1 item from anthropics\/skills/ });
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog.getByRole("region", { name: "New" })).toBeVisible();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog.getByRole("region", { name: "Trust review" })).toBeVisible();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog.getByText("Installed: skill-creator")).toBeVisible();
    expect(await exists(join(SKILL_DIR(), "SKILL.md"))).toBe(true);
  });

  test("Installed tab lists the installed skill", async ({ page }) => {
    await page.goto("/discover");
    await page.getByRole("tab", { name: "Installed" }).click();
    await expect(page.getByText("1 installed item")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "skill-creator" });
    await expect(row).toContainText("anthropics/skills");
    await expect(row).toContainText("Up to date");
  });

  test("Uninstalling a skill removes it from disk", async ({ page }) => {
    await page.goto("/discover");
    await page.getByRole("tab", { name: "Installed" }).click();
    await page.getByRole("button", { name: "Uninstall skill-creator" }).click();
    const dialog = page.getByRole("dialog", { name: "Uninstall skill-creator" });
    await dialog.getByRole("button", { name: "Uninstall", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: "skill-creator" })).toHaveCount(0);
    expect(await exists(SKILL_DIR())).toBe(false);
  });

  test("skills.sh search lists recorded results", async ({ page }) => {
    await page.goto("/discover");
    await page.getByRole("tab", { name: "skills.sh" }).click();
    await page.getByRole("searchbox", { name: "Search skills.sh" }).fill("skill");
    await expect(page.getByText("vercel-react-best-practices").first()).toBeVisible();
  });

  test("Discover makes no outbound requests", async ({ externalRequests }) => {
    const entries = await stubLog();
    expect(entries.length, "stub saw the discover traffic").toBeGreaterThan(0);
    expect(entries.filter((entry) => !entry.matched)).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
});
