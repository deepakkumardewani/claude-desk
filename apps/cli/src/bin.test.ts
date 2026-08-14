import { createServer } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createApp } from "./server.js";
import { startStudio } from "./studio.js";
import { mountStatic, resolveWebDistDir } from "./static.js";

const TEST_TOKEN = "a".repeat(64);
const AUTH = { Authorization: `Bearer ${TEST_TOKEN}` };

let webRoot = "";

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

beforeEach(async () => {
  webRoot = await mkdtemp(join(tmpdir(), "cc-studio-web-"));
  await mkdir(join(webRoot, "assets"), { recursive: true });
  await writeFile(
    join(webRoot, "index.html"),
    '<!doctype html><html><body><div id="root"></div></body></html>',
  );
  await writeFile(join(webRoot, "assets", "app.js"), "console.log('ok')");
});

afterEach(async () => {
  await rm(webRoot, { recursive: true, force: true });
});

describe("resolveWebDistDir", () => {
  test("finds index.html from a sibling web directory", async () => {
    const pkgRoot = await mkdtemp(join(tmpdir(), "cc-studio-pkg-"));
    const distDir = join(pkgRoot, "dist");
    await mkdir(distDir, { recursive: true });
    await mkdir(join(pkgRoot, "web"), { recursive: true });
    await writeFile(join(pkgRoot, "web", "index.html"), "<html></html>");

    const marker = pathToFileURL(join(distDir, "bin.mjs")).href;
    expect(resolveWebDistDir(marker)).toBe(join(pkgRoot, "web"));

    await rm(pkgRoot, { recursive: true, force: true });
  });
});

describe("mountStatic", () => {
  test("serves index.html with lifecycle script and SPA fallback", async () => {
    const app = createApp({ token: TEST_TOKEN });
    mountStatic(app, webRoot);

    const home = await app.request("/");
    expect(home.status).toBe(200);
    const html = await home.text();
    expect(html).toContain("EventSource");
    expect(html).toContain("access_token");
    expect(html).toContain("ccs-token");
    expect(html).toContain("lifecycle");
    expect(html).toContain('id="root"');

    const asset = await app.request("/assets/app.js");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log('ok')");

    const spa = await app.request("/skills/demo");
    expect(spa.status).toBe(200);
    const spaHtml = await spa.text();
    expect(spaHtml).toContain("EventSource");
    expect(spaHtml).toContain("access_token");
  });

  test("rejects path traversal outside web root", async () => {
    const app = createApp({ token: TEST_TOKEN });
    mountStatic(app, webRoot);
    const response = await app.request("/../../etc/passwd");
    const body = await response.text();
    expect(body).not.toContain("root:");
  });

  test("allows static without bearer and rejects API without token", async () => {
    const app = createApp({ token: TEST_TOKEN });
    mountStatic(app, webRoot);

    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/assets/app.js")).status).toBe(200);

    const health = await app.request("/api/health");
    expect(health.status).toBe(401);
    expect(await health.json()).toEqual({ error: "unauthorized" });

    const authed = await app.request("/api/health", { headers: AUTH });
    expect(authed.status).toBe(200);

    const forbidden = await app.request("http://evil.example/api/health", { headers: AUTH });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "forbidden_host" });
  });
});

describe("startStudio lifecycle", () => {
  test("serves API + SPA and exits when lifecycle clients disconnect", async () => {
    const opened: string[] = [];
    const port = await freePort();
    const running = await startStudio({
      port,
      keepAlive: false,
      webDistDir: webRoot,
      openFn: async (url) => {
        opened.push(url);
      },
    });

    expect(opened[0]).toBe(`${running.url}#token=${running.token}`);
    expect(opened[0]).not.toBe(running.url);

    const health = await fetch(`${running.url}api/health`, {
      headers: { Authorization: `Bearer ${running.token}` },
    });
    expect(health.status).toBe(200);

    const home = await fetch(running.url);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("/api/lifecycle");

    const controller = new AbortController();
    const lifecycle = fetch(
      `${running.url}api/lifecycle?access_token=${encodeURIComponent(running.token)}`,
      {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      },
    );

    // Wait until the SSE stream has started (hello event)
    const response = await lifecycle;
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeTruthy();
    await reader!.read();

    controller.abort();
    await running.waitUntilExit();
  });

  test("keep-alive does not exit when lifecycle clients disconnect", async () => {
    const port = await freePort();
    const running = await startStudio({
      port,
      keepAlive: true,
      openBrowser: false,
      webDistDir: webRoot,
    });

    const controller = new AbortController();
    const response = await fetch(`${running.url}api/lifecycle`, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${running.token}`,
      },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    await response.body?.getReader().read();
    controller.abort();

    await new Promise((r) => setTimeout(r, 1000));
    const health = await fetch(`${running.url}api/health`, {
      headers: { Authorization: `Bearer ${running.token}` },
    });
    expect(health.status).toBe(200);

    await running.close();
  });
});
