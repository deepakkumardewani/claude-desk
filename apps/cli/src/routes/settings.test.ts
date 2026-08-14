import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { getSettingsFieldMetadata } from "schema";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createApp } from "../server.js";

const TEST_TOKEN = "a".repeat(64);
const AUTH = { Authorization: `Bearer ${TEST_TOKEN}` };
import { getBackups } from "../fs/backups.js";

let fixtureRoot = "";
let previousRoot: string | undefined;

beforeEach(async () => {
  previousRoot = process.env.CLAUDE_ROOT;
  fixtureRoot = await mkdtemp(join(tmpdir(), "claude-settings-fixture-"));
  process.env.CLAUDE_ROOT = fixtureRoot;
});

afterEach(async () => {
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(fixtureRoot, { recursive: true, force: true });
  // Clean up backup directory
  const backupRoot = resolve(homedir(), ".claude", ".claude-desk-backups");
  try {
    const entries = await readdir(backupRoot);
    for (const entry of entries) {
      if ((entry as string).includes("settings_json")) {
        await rm(join(backupRoot, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // Ignore if backup root doesn't exist
  }
});

describe("/api/settings/schema", () => {
  test("lists every schema field", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings/schema", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { fields: Array<{ key: string }> };
    const metadata = getSettingsFieldMetadata();
    expect(body.fields).toHaveLength(metadata.length);
    expect(body.fields.map((field) => field.key).sort()).toEqual(
      metadata.map((field) => field.key).sort(),
    );
  });
});

describe("/api/settings", () => {
  test("returns parsed settings from fixture file", async () => {
    await writeFile(
      join(fixtureRoot, "settings.json"),
      JSON.stringify({ model: "opus", alwaysThinkingEnabled: false, effortLevel: "high" }),
    );

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      settings: { model: string; effortLevel: string; alwaysThinkingEnabled: boolean };
    };
    expect(body.settings.model).toBe("opus");
    expect(body.settings.effortLevel).toBe("high");
    expect(body.settings.alwaysThinkingEnabled).toBe(false);
  });

  test("returns empty default when settings file is missing", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings", { headers: AUTH });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings: {} });
  });

  test("returns 422 for invalid settings content", async () => {
    await writeFile(join(fixtureRoot, "settings.json"), JSON.stringify({ effortLevel: "turbo" }));

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings", { headers: AUTH });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string; issues?: unknown[] };
    expect(body.error).toBe("invalid settings.json");
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  test("returns 422 for malformed JSON", async () => {
    await writeFile(join(fixtureRoot, "settings.json"), "{not-json");

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings", { headers: AUTH });
    expect(response.status).toBe(422);
    expect((await response.json()) as { error: string }).toEqual({
      error: "invalid JSON in settings.json",
    });
  });
});

describe("PUT /api/settings", () => {
  test("returns 400 and leaves disk unchanged for invalid settings", async () => {
    await writeFile(
      join(fixtureRoot, "settings.json"),
      JSON.stringify({ model: "opus", effortLevel: "high" }),
    );

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings", {
      method: "PUT",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ effortLevel: "turbo" }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; issues?: unknown[] };
    expect(body.error).toBe("invalid settings");
    expect(body.issues?.length).toBeGreaterThan(0);

    const current = JSON.parse(await readFile(join(fixtureRoot, "settings.json"), "utf8")) as {
      effortLevel: string;
    };
    expect(current.effortLevel).toBe("high");
  });

  test("writes valid settings and creates backup", async () => {
    const settingsPath = join(fixtureRoot, "settings.json");
    await writeFile(settingsPath, JSON.stringify({ model: "opus", alwaysThinkingEnabled: true }));

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings", {
      method: "PUT",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sonnet", effortLevel: "low", alwaysThinkingEnabled: false }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      settings: { model: string; effortLevel: string; alwaysThinkingEnabled: boolean };
    };
    expect(body.settings.model).toBe("sonnet");
    expect(body.settings.effortLevel).toBe("low");
    expect(body.settings.alwaysThinkingEnabled).toBe(false);

    // Check that a backup was created
    const backups = await getBackups(settingsPath);
    expect(backups.length).toBeGreaterThan(0);

    // Verify the backup content
    const backup = JSON.parse(await readFile(backups[0].path, "utf8")) as {
      model: string;
    };
    expect(backup.model).toBe("opus");
  });

  test("returns 400 for malformed request body", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/settings", {
      method: "PUT",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: "{not-json",
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({ error: "invalid JSON body" });
  });
});
