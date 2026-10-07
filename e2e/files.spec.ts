import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { e2eHome, SEED_DIR } from "./fixtures/helpers.js";
import { expect, resetHome, test } from "./fixtures/index.js";

const SKILL_URL = "/user/skills/release-notes/SKILL.md";
const SEED_SKILL = join(SEED_DIR, ".claude/skills/release-notes/SKILL.md");
const homeFile = (relative: string) => join(e2eHome(), relative);

test.describe.configure({ mode: "serial" });
test.beforeAll(resetHome);

test.describe("Workspace Files", () => {
  test("Browse the skills tree and open a skill file", async ({ page }) => {
    await page.goto("/user");
    await page.getByRole("link", { name: /^Skills 3/ }).click();
    await page.getByRole("button", { name: "Expand release-notes" }).click();
    await page.getByRole("link", { name: "SKILL.md" }).click();
    await expect(page).toHaveURL(new RegExp(`${SKILL_URL}$`));
    await expect(page.getByRole("heading", { name: "release-notes" })).toBeVisible();
    await expect(page.getByText("Draft release notes from merged pull requests.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  test("View an agent file", async ({ page }) => {
    await page.goto("/user/agents/reviewer.md");
    await expect(page.getByRole("heading", { name: "reviewer" })).toBeVisible();
    await expect(page.getByText("Reviews pull requests for correctness and style.")).toBeVisible();
  });

  test("Cancelling an edit leaves the skill file unchanged", async ({ page }) => {
    await page.goto(SKILL_URL);
    await page.getByRole("button", { name: "Edit" }).click();
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("discard me");
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page
      .getByRole("dialog", { name: "Unsaved changes" })
      .getByRole("button", { name: "Discard" })
      .click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    const onDisk = await readFile(homeFile(".claude/skills/release-notes/SKILL.md"), "utf8");
    expect(onDisk).toBe(await readFile(SEED_SKILL, "utf8"));
  });

  test("Editing a skill file saves it to disk", async ({ page }) => {
    await page.goto(SKILL_URL);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nEdited by e2e.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    const onDisk = await readFile(homeFile(".claude/skills/release-notes/SKILL.md"), "utf8");
    expect(onDisk.trimEnd().endsWith("Edited by e2e.")).toBe(true);
    expect(onDisk.startsWith("---\n")).toBe(true);
    expect(onDisk).toContain("description: Draft release notes from merged pull requests.");
  });

  test("Editing CLAUDE.md saves it to disk", async ({ page }) => {
    await page.goto("/user/claude-md");
    await page.getByRole("button", { name: "Edit" }).click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nAlways add e2e coverage.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    const onDisk = await readFile(homeFile(".claude/CLAUDE.md"), "utf8");
    expect(onDisk).toContain("Always add e2e coverage.");
    expect(onDisk).toContain("Prefer small, reviewable changes.");
  });

  test("Opening a missing skill file shows an error", async ({
    page,
    allowExpectedConsoleError,
  }) => {
    allowExpectedConsoleError(/404/);
    await page.goto("/user/skills/release-notes");
    await expect(page.getByText("Unable to load this file.")).toBeVisible();
  });
});
