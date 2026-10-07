import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { e2eHome } from "./fixtures/helpers.js";
import { expect, resetHome, test } from "./fixtures/index.js";

type McpServers = Record<string, { command?: string; type?: string; url?: string }>;

const readUserServers = async (): Promise<McpServers> => {
  const json = JSON.parse(await readFile(join(e2eHome(), ".claude.json"), "utf8"));
  return json.mcpServers ?? {};
};

const serverRow = (page: Page) => page.locator("[data-origin]");

test.describe.configure({ mode: "serial" });
test.beforeAll(resetHome);

test.describe("MCP Servers", () => {
  test("MCP page lists installed servers with health", async ({ page }) => {
    await page.goto("/user/mcp");
    await expect(page.getByRole("heading", { name: "MCP Servers" })).toBeVisible();
    const echo = serverRow(page).filter({ hasText: "local-echo" });
    await expect(echo).toContainText(/stdio/i);
    await expect(echo).toContainText(/connected/i);
    const broken = serverRow(page).filter({ hasText: "broken-remote" });
    await expect(broken).toContainText(/http/i);
    await expect(broken).toContainText(/failed/i);
  });

  test("Adding a custom stdio server writes it to .claude.json", async ({ page }) => {
    await page.goto("/user/mcp");
    await page.getByRole("button", { name: "Add custom" }).click();
    const dialog = page.getByRole("dialog", { name: "Add MCP Server" });
    await dialog.getByPlaceholder("e.g. my-server").fill("e2e-custom");
    await dialog.getByPlaceholder("e.g. npx").fill("node");
    await dialog.getByPlaceholder("e.g. -y some-package").fill("-e 0");
    await dialog.getByRole("button", { name: "Add Server" }).click();
    await expect(page.getByText("e2e-custom", { exact: true })).toBeVisible();
    const servers = await readUserServers();
    expect(servers["e2e-custom"]?.command).toBe("node");
  });

  test("Removing a server deletes it from .claude.json", async ({ page }) => {
    await page.goto("/user/mcp");
    const row = serverRow(page).filter({ hasText: "e2e-custom" });
    await row.getByRole("button", { name: "Remove" }).click();
    await row.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("e2e-custom", { exact: true })).toHaveCount(0);
    const servers = await readUserServers();
    expect(servers["e2e-custom"]).toBeUndefined();
    expect(servers["local-echo"]).toBeDefined();
  });

  test("Installing a catalog server adds it to .claude.json", async ({ page }) => {
    await page.goto("/user/mcp");
    const memory = page.locator("article").filter({ hasText: "Memory" }).first();
    await memory.getByRole("button", { name: /Install/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add MCP Server" });
    await expect(dialog).toContainText(/Installs as:\s*server-memory/);
    await dialog.getByRole("button", { name: "Install Server" }).click();
    await expect.poll(async () => Object.keys(await readUserServers())).toContain("server-memory");
  });
});
