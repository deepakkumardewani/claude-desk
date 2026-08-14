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
  fixtureRoot = await mkdtemp(join(tmpdir(), "claude-skills-fixture-"));
  process.env.CLAUDE_ROOT = fixtureRoot;

  await mkdir(join(fixtureRoot, "skills"), { recursive: true });
  await mkdir(join(fixtureRoot, "skills", "colorize"), { recursive: true });
  await writeFile(join(fixtureRoot, "skills", "colorize", "SKILL.md"), "# Colorize");
  await mkdir(join(fixtureRoot, "skills", "animate"), { recursive: true });
  await writeFile(join(fixtureRoot, "skills", "animate", "SKILL.md"), "# Animate");
});

afterEach(async () => {
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("/api/skills", () => {
  test("returns skills sorted alphabetically with default value 'on'", async () => {
    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/skills", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      skills: Array<{ name: string; label: string; value: string }>;
    };

    expect(body.skills).toHaveLength(2);
    expect(body.skills[0].name).toBe("animate");
    expect(body.skills[0].value).toBe("on");
    expect(body.skills[1].name).toBe("colorize");
    expect(body.skills[1].value).toBe("on");
  });

  test("reflects skillOverrides from settings.json", async () => {
    await writeFile(
      join(fixtureRoot, "settings.json"),
      JSON.stringify({ skillOverrides: { colorize: "off" } }),
    );

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/skills", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      skills: Array<{ name: string; value: string }>;
    };

    const colorize = body.skills.find((s) => s.name === "colorize");
    expect(colorize?.value).toBe("off");

    const animate = body.skills.find((s) => s.name === "animate");
    expect(animate?.value).toBe("on");
  });

  test("returns empty list when skills directory is absent", async () => {
    await rm(join(fixtureRoot, "skills"), { recursive: true, force: true });

    const app = createApp({ token: TEST_TOKEN });
    const response = await app.request("/api/skills", { headers: AUTH });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { skills: unknown[] };
    expect(body.skills).toHaveLength(0);
  });
});
