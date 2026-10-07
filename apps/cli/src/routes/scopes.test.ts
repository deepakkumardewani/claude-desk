import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../server.js";
import { useTempHome } from "../testing/tempHomeHooks.js";
import { getScopesResponse } from "./scopes.js";

const home = useTempHome();

describe("getScopesResponse", () => {
  it("offers only the user scope without a projectDir", async () => {
    expect(await getScopesResponse()).toEqual({
      status: 200,
      body: { scopes: ["user"], projectPath: null },
    });
  });

  it("offers only the user scope when the project dir does not exist", async () => {
    const result = await getScopesResponse(join(home().home, "missing"));
    expect(result.body).toEqual({ scopes: ["user"], projectPath: null });
  });

  it("offers project scope for an existing directory, with or without .claude", async () => {
    const project = join(home().home, "proj");
    await mkdir(project);
    const result = await getScopesResponse(project);
    expect(result.body).toEqual({ scopes: ["user", "project"], projectPath: project });
  });

  it("returns 400 for a relative or traversing projectDir", async () => {
    expect((await getScopesResponse("relative")).status).toBe(400);
    const traversal = await getScopesResponse("/tmp/a/../b");
    expect(traversal.status).toBe(400);
  });
});

describe("/api/scopes", () => {
  it("responds through the app", async () => {
    const app = createApp({ token: "s".repeat(64) });
    const res = await app.request("http://127.0.0.1/api/scopes?projectDir=bad", {
      headers: { Authorization: `Bearer ${"s".repeat(64)}` },
    });
    expect(res.status).toBe(400);
  });
});
