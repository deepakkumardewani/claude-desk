import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../server.js";
import { useTempHome } from "../testing/tempHomeHooks.js";
import { getFileResponse, postFileResponse } from "./file.js";

const TOKEN = "f".repeat(64);
const AUTH = { Authorization: `Bearer ${TOKEN}` };

const home = useTempHome();

async function seedSkill(name: string, content: string): Promise<void> {
  const dir = join(home().claudeDir, "skills");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), content);
}

describe("getFileResponse", () => {
  it("reads an existing file", async () => {
    await seedSkill("alpha.md", "# Alpha");
    const result = await getFileResponse("skills", "alpha.md");
    expect(result).toEqual({
      status: 200,
      body: { category: "skills", name: "alpha.md", content: "# Alpha" },
    });
  });

  it("reads singleton categories without a name and labels them", async () => {
    await mkdir(home().claudeDir, { recursive: true });
    await writeFile(join(home().claudeDir, "CLAUDE.md"), "# Mine");
    await writeFile(join(home().claudeDir, "settings.json"), "{}");

    const md = await getFileResponse("claudeMd", "");
    expect(md.status).toBe(200);
    expect(md.body).toMatchObject({ name: "CLAUDE.md", content: "# Mine" });
    const settings = await getFileResponse("settings", "");
    expect(settings.body).toMatchObject({ name: "settings.json", content: "{}" });
  });

  it("returns 404 for a missing file", async () => {
    expect(await getFileResponse("skills", "missing.md")).toEqual({
      status: 404,
      body: { error: "file not found" },
    });
  });

  it("returns 400 for an invalid category and a blank name", async () => {
    expect((await getFileResponse("nope", "x")).status).toBe(400);
    expect(await getFileResponse("skills", "   ")).toEqual({
      status: 400,
      body: { error: "name is required" },
    });
  });

  it("returns 400 for a relative project dir", async () => {
    const result = await getFileResponse("skills", "a.md", "project", "relative/dir");
    expect(result.status).toBe(400);
  });

  it("rejects paths escaping the scope root with 403", async () => {
    await writeFile(join(home().home, "secret.txt"), "top secret");
    const result = await getFileResponse("skills", "../../secret.txt");
    expect(result).toEqual({ status: 403, body: { error: "forbidden path" } });
  });

  it("reads project scope files", async () => {
    const project = join(home().home, "proj");
    await mkdir(join(project, ".claude", "commands"), { recursive: true });
    await writeFile(join(project, ".claude", "commands", "go.md"), "go");
    const result = await getFileResponse("commands", "go.md", "project", project);
    expect(result.body).toMatchObject({ content: "go" });
  });
});

describe("postFileResponse", () => {
  it("writes a new file and returns ok", async () => {
    const result = await postFileResponse("skills", "new.md", "hello");
    expect(result).toEqual({ status: 200, body: { category: "skills", name: "new.md", ok: true } });
    expect(await readFile(join(home().claudeDir, "skills", "new.md"), "utf8")).toBe("hello");
  });

  it("overwrites an existing file", async () => {
    await seedSkill("a.md", "old");
    const result = await postFileResponse("skills", "a.md", "new");
    expect(result.status).toBe(200);
    expect(await readFile(join(home().claudeDir, "skills", "a.md"), "utf8")).toBe("new");
  });

  it("allows claudeMd without a name", async () => {
    await mkdir(home().claudeDir, { recursive: true });
    const result = await postFileResponse("claudeMd", "", "# hi");
    expect(result.body).toMatchObject({ name: "CLAUDE.md", ok: true });
  });

  it("rejects invalid category, blank name, settings and plugins", async () => {
    expect((await postFileResponse("nope", "x", "c")).status).toBe(400);
    expect((await postFileResponse("skills", " ", "c")).status).toBe(400);
    expect((await postFileResponse("settings", "settings.json", "{}")).status).toBe(400);
    expect((await postFileResponse("plugins", "p", "c")).status).toBe(403);
  });

  it("rejects a relative project dir with 400", async () => {
    const result = await postFileResponse("skills", "a.md", "c", "project", "rel");
    expect(result.status).toBe(400);
  });

  it("rejects traversal with 403 and writes nothing outside the root", async () => {
    const result = await postFileResponse("skills", "../../escaped.md", "x");
    expect(result).toEqual({ status: 403, body: { error: "forbidden path" } });
    expect(existsSync(join(home().home, "escaped.md"))).toBe(false);
  });
});

describe("/api/file", () => {
  it("round-trips through the app and validates the body", async () => {
    const app = createApp({ token: TOKEN });
    const url = "http://127.0.0.1/api/file?category=skills&name=r.md";

    const bad = await app.request(url, { method: "POST", headers: AUTH, body: "not json" });
    expect(bad.status).toBe(400);
    const wrongType = await app.request(url, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ content: 5 }),
    });
    expect(wrongType.status).toBe(400);

    const saved = await app.request(url, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ content: "body" }),
    });
    expect(saved.status).toBe(200);
    const read = await app.request(url, { headers: AUTH });
    expect(await read.json()).toMatchObject({ content: "body" });
  });

  it("returns 400 when project scope has no projectDir", async () => {
    const app = createApp({ token: TOKEN });
    const res = await app.request(
      "http://127.0.0.1/api/file?category=skills&name=a&scope=project",
      {
        headers: AUTH,
      },
    );
    expect(res.status).toBe(400);
  });
});
