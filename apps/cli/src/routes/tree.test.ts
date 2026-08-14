import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createApp } from "../server.js";

const TEST_TOKEN = "a".repeat(64);
const AUTH = { Authorization: `Bearer ${TEST_TOKEN}` };

let fixtureRoot = "";
let previousRoot: string | undefined;

beforeEach(async () => {
  previousRoot = process.env.CLAUDE_ROOT;
  fixtureRoot = await mkdtemp(join(tmpdir(), "claude-api-fixture-"));
  process.env.CLAUDE_ROOT = fixtureRoot;

  await mkdir(join(fixtureRoot, "skills"), { recursive: true });
  await writeFile(join(fixtureRoot, "skills", "alpha.md"), "# Alpha");
  await writeFile(join(fixtureRoot, "CLAUDE.md"), "# Claude");
});

afterEach(async () => {
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("/api/tree", () => {
  test("returns all seven categories including agents and plugins", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/tree", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      categories: Array<{ category: string; label: string; files: Array<{ name: string }> }>;
    };

    expect(body.categories).toHaveLength(7);
    expect(body.categories.map((entry) => entry.category)).toEqual([
      "skills",
      "plans",
      "commands",
      "claudeMd",
      "settings",
      "agents",
      "plugins",
    ]);

    const skills = body.categories.find((entry) => entry.category === "skills");
    expect(skills?.files).toEqual([{ name: "alpha.md" }]);

    const agents = body.categories.find((entry) => entry.category === "agents");
    expect(agents?.files).toEqual([]);

    const plugins = body.categories.find((entry) => entry.category === "plugins");
    expect(plugins?.files).toEqual([]);
  });

  test("returns agents when agent files exist", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.join(fixtureRoot, "agents"), { recursive: true });
    await fs.writeFile(path.join(fixtureRoot, "agents", "my-agent.md"), "# My Agent");

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/tree", { headers: AUTH });
    const body = (await response.json()) as {
      categories: Array<{ category: string; files: Array<{ name: string }> }>;
    };

    const agents = body.categories.find((entry) => entry.category === "agents");
    expect(agents?.files).toEqual([{ name: "my-agent.md" }]);
  });
});

describe("POST /api/file", () => {
  test("writes an agent .md file", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.join(fixtureRoot, "agents"), { recursive: true });

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=agents&name=my-agent.md", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "# My Agent" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; category: string; name: string };
    expect(body.ok).toBe(true);
    expect(body.category).toBe("agents");
    expect(body.name).toBe("my-agent.md");
  });

  test("writes a skill .md file", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.join(fixtureRoot, "skills"), { recursive: true });

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=skills&name=my-skill.md", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "# My Skill" }),
    });

    expect(response.status).toBe(200);
  });

  test("returns 400 for invalid category", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=invalid&name=foo.md", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid category" });
  });

  test("returns 400 for settings category", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=settings&name=", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ content: '{"model":"opus"}' }),
    });
    expect(response.status).toBe(400);
  });

  test("returns 403 for traversal attempts", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=agents&name=..%2F..%2Fetc%2Fpasswd", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ content: "evil" }),
    });
    expect(response.status).toBe(403);
  });
});

describe("/api/file", () => {
  test("returns markdown content for a valid file", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=skills&name=alpha.md", {
      headers: AUTH,
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { content: string; category: string; name: string };
    expect(body.content).toBe("# Alpha");
    expect(body.category).toBe("skills");
    expect(body.name).toBe("alpha.md");
  });

  test("returns claudeMd without a name", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=claudeMd&name=", {
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { content: string };
    expect(body.content).toBe("# Claude");
  });

  test("returns 400 for invalid category", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=cache&name=secret.db", {
      headers: AUTH,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid category" });
  });

  test("returns 403 for traversal attempts", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=skills&name=..%2F..%2Fetc%2Fpasswd", {
      headers: AUTH,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden path" });
  });

  test("returns 404 for missing files", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/file?category=skills&name=missing.md", {
      headers: AUTH,
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "file not found" });
  });
});
