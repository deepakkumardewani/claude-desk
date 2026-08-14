import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, beforeEach, afterEach, vi } from "vite-plus/test";
import { createApp } from "../server.js";

const TEST_TOKEN = "a".repeat(64);
const AUTH = { Authorization: `Bearer ${TEST_TOKEN}` };
import type { StatusItem } from "schema";

let fixtureRoot = "";
let previousRoot: string | undefined;

beforeEach(async () => {
  previousRoot = process.env.CLAUDE_ROOT;
  fixtureRoot = await mkdtemp(join(tmpdir(), "claude-status-fixture-"));
  process.env.CLAUDE_ROOT = fixtureRoot;
});

afterEach(async () => {
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(fixtureRoot, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("GET /api/status", () => {
  test("returns all ok when setup is complete", async () => {
    await writeFile(
      join(fixtureRoot, "settings.json"),
      JSON.stringify({
        model: "opus",
        enabledMcpjsonServers: ["stdio"],
        enabledPlugins: { "plugin-1": true },
      }),
    );
    await writeFile(join(fixtureRoot, "CLAUDE.md"), "# CLAUDE Instructions\n");

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { allOk: boolean; items: StatusItem[] };
    expect(body.allOk).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);

    const settingsItem = body.items.find((item) => item.id === "settings");
    expect(settingsItem?.status).toBe("ok");

    const claudeMdItem = body.items.find((item) => item.id === "claude-md");
    expect(claudeMdItem?.status).toBe("ok");
  });

  test("warns when settings.json is missing", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { items: StatusItem[] };
    const settingsItem = body.items.find((item) => item.id === "settings");
    expect(settingsItem?.status).toBe("warn");
    expect(settingsItem?.fixRoute).toBe("/settings");
  });

  test("warns when CLAUDE.md is missing", async () => {
    await writeFile(join(fixtureRoot, "settings.json"), JSON.stringify({ model: "opus" }));

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { items: StatusItem[] };
    const claudeMdItem = body.items.find((item) => item.id === "claude-md");
    expect(claudeMdItem?.status).toBe("warn");
    expect(claudeMdItem?.fixRoute).toBe("/claude-md");
  });

  test("reports ok when MCP is not configured", async () => {
    await writeFile(join(fixtureRoot, "settings.json"), JSON.stringify({ model: "opus" }));
    await writeFile(join(fixtureRoot, "CLAUDE.md"), "# CLAUDE Instructions\n");

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { items: StatusItem[] };
    const mcpItem = body.items.find((item) => item.id === "mcp-config");
    expect(mcpItem?.status).toBe("ok");
    expect(mcpItem?.message).toBe("None configured");
    expect(mcpItem?.fixRoute).toBeUndefined();
  });

  test("reports ok when plugins are not configured", async () => {
    await writeFile(
      join(fixtureRoot, "settings.json"),
      JSON.stringify({
        model: "opus",
        enabledMcpjsonServers: ["stdio"],
      }),
    );
    await writeFile(join(fixtureRoot, "CLAUDE.md"), "# CLAUDE Instructions\n");

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { items: StatusItem[] };
    const pluginsItem = body.items.find((item) => item.id === "plugins");
    expect(pluginsItem?.status).toBe("ok");
    expect(pluginsItem?.message).toBe("No plugins enabled");
    expect(pluginsItem?.fixRoute).toBeUndefined();
  });

  test("warns when settings.json is malformed", async () => {
    await writeFile(join(fixtureRoot, "settings.json"), "{not-json");

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { items: StatusItem[] };
    const settingsItem = body.items.find((item) => item.id === "settings");
    expect(settingsItem?.status).toBe("warn");
  });

  test("marks allOk as false when any item is not ok", async () => {
    await writeFile(join(fixtureRoot, "settings.json"), JSON.stringify({ model: "opus" }));

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { allOk: boolean };
    expect(body.allOk).toBe(false);
  });

  test("includes message and fixRoute for each item", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/status", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { items: StatusItem[] };
    for (const item of body.items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("message");
      if ((item as any).status !== "ok") {
        expect(item).toHaveProperty("fixRoute");
      }
    }
  });
});
