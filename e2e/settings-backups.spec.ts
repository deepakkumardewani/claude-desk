import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { e2eHome } from "./fixtures/helpers.js";
import { expect, resetHome, test } from "./fixtures/index.js";

const SETTINGS_PATH = () => join(e2eHome(), ".claude/settings.json");
const readSettings = async () => JSON.parse(await readFile(SETTINGS_PATH(), "utf8"));

test.describe.configure({ mode: "serial" });
test.beforeAll(resetHome);

test.describe("Backups before any save", () => {
  test("Backups page is empty before any save", async ({ page }) => {
    await page.goto("/backups");
    await expect(
      page.getByText("No backups yet. Saving a file creates a snapshot automatically."),
    ).toBeVisible();
  });
});

test.describe("Settings Editor", () => {
  test("Settings page lists sections and option count", async ({ page }) => {
    await page.goto("/user/settings");
    await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
    await expect(page.getByText(/settings\.json\s*·\s*83 options/)).toBeVisible();
    for (const section of [
      "General",
      "Permissions",
      "Hooks",
      "Plugins & Marketplaces",
      "MCP Servers",
    ]) {
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible();
    }
  });

  test("Changing the model saves it to settings.json", async ({ page }) => {
    await page.goto("/user/settings");
    await page.getByRole("textbox", { name: "Model", exact: true }).fill("opus");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    const settings = await readSettings();
    expect(settings.model).toBe("opus");
    expect(settings.env).toMatchObject({ E2E_FLAG: expect.any(String) });
    expect(settings.permissions).toBeDefined();
  });

  test("Invalid value blocks saving with a validation error", async ({ page }) => {
    await page.goto("/user/settings");
    // The form resets once settings load; typing before that would be discarded.
    await expect(page.getByRole("textbox", { name: "Model", exact: true })).toHaveValue("opus");
    await page.getByRole("textbox", { name: "Cleanup Period Days" }).fill("30");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Invalid input")).toBeVisible();
    await expect(page.getByText("Fix 1 validation error before saving.")).toBeVisible();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByText("Fix 1 validation error before saving.")).toHaveCount(0);
    expect((await readSettings()).cleanupPeriodDays).toBeUndefined();
  });
});

test.describe("Backups", () => {
  test("Saving settings creates a backup entry", async ({ page }) => {
    await page.goto("/backups");
    await expect(page.getByRole("button", { name: /settings\.json\s*1 backup/ })).toBeVisible();
  });

  test("Restoring a backup restores the file content", async ({ page }) => {
    await page.goto("/backups");
    await page.getByRole("button", { name: /settings\.json\s*1 backup/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText(/Restored backup from/)).toBeVisible();
    expect((await readSettings()).model).toBe("sonnet");
  });
});
