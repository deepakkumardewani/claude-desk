import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/index.js";

async function openUsageTab(page: Page, tab: string): Promise<void> {
  await page.goto("/usage");
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
  await page.getByRole("tab", { name: tab, exact: true }).click();
}

test.describe("Usage Dashboard", () => {
  test("Usage overview shows all-time totals", async ({ page }) => {
    await page.goto("/usage");
    await expect(page.getByText(/^Loading/)).toHaveCount(0);
    const main = page.getByRole("main");
    await expect(main).toContainText("$0.1728");
    await expect(main).toContainText("23.5K");
    await expect(main).toContainText(/Sessions\s*4/);
    await expect(main).toContainText(/Projects\s*2/);
  });

  test("Usage timeline lists the four seeded days", async ({ page }) => {
    await openUsageTab(page, "Timeline");
    const main = page.getByRole("main");
    for (const [day, cost] of [
      ["2026-06-10", "$0.0455"],
      ["2026-06-11", "$0.0090"],
      ["2026-06-12", "$0.0865"],
      ["2026-06-14", "$0.0318"],
    ]) {
      await expect(main).toContainText(day);
      await expect(main).toContainText(cost);
    }
  });

  test("Usage models tab shows the per-model split", async ({ page }) => {
    await openUsageTab(page, "Models");
    const main = page.getByRole("main");
    for (const [model, cost, share] of [
      ["opus-4-7", "$0.0900", "52.1%"],
      ["sonnet-4-6", "$0.0683", "39.5%"],
      ["haiku-4-5", "$0.0145", "8.4%"],
    ]) {
      await expect(main).toContainText(model);
      await expect(main).toContainText(cost);
      await expect(main).toContainText(share);
    }
  });

  test("Usage projects tab shows the per-project cost", async ({ page }) => {
    await openUsageTab(page, "Projects");
    const main = page.getByRole("main");
    await expect(main).toContainText("workspace/billing-api");
    await expect(main).toContainText("$0.0867");
    await expect(main).toContainText("workspace/acme-app");
    await expect(main).toContainText("$0.0860");
  });

  test("Usage sessions tab lists four sessions", async ({ page }) => {
    await openUsageTab(page, "Sessions");
    const rows = page.getByRole("main").getByRole("row");
    await expect(rows).toHaveCount(5);
    const main = page.getByRole("main");
    for (const cost of ["$0.0813", "$0.0545", "$0.0315", "$0.0055"]) {
      await expect(main).toContainText(cost);
    }
  });

  test("Usage prompts tab lists seven prompts", async ({ page }) => {
    await openUsageTab(page, "Prompts");
    const main = page.getByRole("main");
    await expect(main.getByRole("listitem")).toHaveCount(7);
    await expect(
      main.getByRole("listitem").filter({ hasText: "Explain the ledger schema" }),
    ).toContainText("$0.0055");
    await expect(
      main.getByRole("listitem").filter({ hasText: "Add retry logic to the fetch client" }),
    ).toContainText("$0.0105");
  });
});

test.describe("Context Summary", () => {
  test("Context page shows the token summary", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Context" })).toBeVisible();
    await expect(page.getByText("User (~/.claude)")).toBeVisible();
    await expect(page.getByText("12,000 tokens")).toBeVisible();
    await expect(page.getByText("Sonnet 4.6")).toBeVisible();
    await expect(page.getByText("12.0k / 200.0k (6%)")).toBeVisible();
    await expect(page.getByText("188.0k free")).toBeVisible();
  });

  test("Context categories show fixed token counts", async ({ page }) => {
    await page.goto("/workspace");
    for (const [category, tokens] of [
      ["System prompt", "3,000"],
      ["System tools", "8,000"],
      ["Memory files", "1,000"],
      ["Free space", "188,000"],
    ]) {
      await expect(page.getByRole("row", { name: new RegExp(category) })).toContainText(tokens);
    }
  });

  test("Memory files category expands to the CLAUDE.md entry", async ({ page }) => {
    await page.goto("/workspace");
    await page.getByRole("button", { name: /Memory files/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "User · CLAUDE.md" })).toContainText(
      "1,000",
    );
  });
});
