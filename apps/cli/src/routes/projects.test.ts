import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../server.js";
import { useTempHome } from "../testing/tempHomeHooks.js";
import { getProjectsResponse } from "./projects.js";

const home = useTempHome();

async function writeClaudeJson(content: string): Promise<void> {
  await writeFile(join(home().home, ".claude.json"), content);
}

describe("getProjectsResponse", () => {
  it("returns an empty list when .claude.json is missing", async () => {
    expect(await getProjectsResponse()).toEqual({ status: 200, body: { projects: [] } });
  });

  it("returns an empty list when .claude.json is malformed", async () => {
    await writeClaudeJson("{not json");
    expect((await getProjectsResponse()).body.projects).toEqual([]);
  });

  it("lists known projects and flags which directories exist", async () => {
    const existing = join(home().home, "exists");
    await mkdir(existing);
    const gone = join(home().home, "gone");
    await writeClaudeJson(JSON.stringify({ projects: { [existing]: {}, [gone]: {} } }));

    const { projects } = (await getProjectsResponse()).body;
    expect(projects).toEqual([
      { dir: existing, name: "exists", exists: true },
      { dir: gone, name: "gone", exists: false },
    ]);
  });

  it("tolerates a .claude.json without a projects key", async () => {
    await writeClaudeJson("{}");
    expect((await getProjectsResponse()).body.projects).toEqual([]);
  });

  it("merges absolute extra dirs, de-duplicated, ignoring relative and blank entries", async () => {
    const known = join(home().home, "known");
    const extra = join(home().home, "extra");
    await writeClaudeJson(JSON.stringify({ projects: { [known]: {} } }));

    const raw = `${known}, ${extra} ,relative/dir,, ${extra}`;
    const { projects } = (await getProjectsResponse(raw)).body;
    expect(projects.map((project) => project.dir)).toEqual([known, extra]);
  });

  it("rethrows unexpected read errors", async () => {
    // A directory at the .claude.json path makes readFile fail with EISDIR, not ENOENT.
    await mkdir(join(home().home, ".claude.json"));
    await expect(getProjectsResponse()).rejects.toMatchObject({ code: "EISDIR" });
  });
});

describe("/api/projects", () => {
  it("requires auth and serves the list when authorised", async () => {
    const app = createApp({ token: "p".repeat(64) });
    expect((await app.request("http://127.0.0.1/api/projects")).status).toBe(401);
    const res = await app.request("http://127.0.0.1/api/projects?extra=/tmp/x", {
      headers: { Authorization: `Bearer ${"p".repeat(64)}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      projects: [{ dir: "/tmp/x", name: "x", exists: expect.any(Boolean) }],
    });
  });
});
