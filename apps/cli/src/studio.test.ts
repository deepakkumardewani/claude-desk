import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useTempHome } from "./testing/tempHomeHooks.js";
import { startStudio } from "./studio.js";

let webRoot = "";

describe("startStudio", () => {
  useTempHome();

  beforeEach(async () => {
    webRoot = await mkdtemp(join(tmpdir(), "cc-studio-web-"));
    await mkdir(webRoot, { recursive: true });
    await writeFile(join(webRoot, "index.html"), "<!doctype html><html></html>");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (webRoot) {
      await rm(webRoot, { recursive: true, force: true });
      webRoot = "";
    }
  });

  it("starts a server with port 0 and returns bound port", async () => {
    process.env.CC_STUDIO_NO_OPEN = "1";
    const server = await startStudio({ port: 0, keepAlive: false, webDistDir: webRoot });

    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toContain("http://127.0.0.1");
    expect(server.token).toMatch(/^[0-9a-f]{64}$/);

    await server.close();
  });

  it("does not open browser when CC_STUDIO_NO_OPEN is set", async () => {
    process.env.CC_STUDIO_NO_OPEN = "1";
    const openFn = vi.fn();

    const server = await startStudio({
      port: 0,
      keepAlive: false,
      webDistDir: webRoot,
      openBrowser: true,
      openFn,
    });

    expect(openFn).not.toHaveBeenCalled();
    await server.close();
  });

  it("opens browser when openBrowser is true and CC_STUDIO_NO_OPEN is not set", async () => {
    delete process.env.CC_STUDIO_NO_OPEN;
    const openFn = vi.fn().mockResolvedValue(undefined);

    const server = await startStudio({
      port: 0,
      keepAlive: false,
      webDistDir: webRoot,
      openBrowser: true,
      openFn,
    });

    expect(openFn).toHaveBeenCalledWith(
      expect.stringContaining(`http://127.0.0.1:${server.port}/#token=`),
    );

    await server.close();
  });

  it("includes token in URL passed to openFn", async () => {
    delete process.env.CC_STUDIO_NO_OPEN;
    const openFn = vi.fn().mockResolvedValue(undefined);
    const testToken = "abc123def456";

    const server = await startStudio({
      port: 0,
      keepAlive: false,
      webDistDir: webRoot,
      openBrowser: true,
      token: testToken,
      openFn,
    });

    const expectedUrl = `http://127.0.0.1:${server.port}/#token=${testToken}`;
    expect(openFn).toHaveBeenCalledWith(expectedUrl);

    await server.close();
  });

  it("closes server and resolves properly", async () => {
    process.env.CC_STUDIO_NO_OPEN = "1";
    const server = await startStudio({ port: 0, keepAlive: false, webDistDir: webRoot });

    const closePromise = server.close();
    await expect(closePromise).resolves.toBeUndefined();
  });

  it("keeps server alive when keepAlive is true", async () => {
    process.env.CC_STUDIO_NO_OPEN = "1";
    const server = await startStudio({ port: 0, keepAlive: true, webDistDir: webRoot });

    await server.close();
  });

  it("responds to requests with bearer token in Authorization header", async () => {
    process.env.CC_STUDIO_NO_OPEN = "1";
    const server = await startStudio({
      port: 0,
      keepAlive: false,
      webDistDir: webRoot,
      token: "test-token",
    });

    // Test that the API endpoint works with bearer token
    const res = await fetch(`${server.url}api/health`, {
      headers: {
        Host: "127.0.0.1",
        Authorization: `Bearer ${server.token}`,
      },
    });

    expect(res.status).toBe(200);

    await server.close();
  });

  it("generates unique tokens for different instances", async () => {
    process.env.CC_STUDIO_NO_OPEN = "1";
    const server1 = await startStudio({ port: 0, keepAlive: false, webDistDir: webRoot });
    const server2 = await startStudio({ port: 0, keepAlive: false, webDistDir: webRoot });

    expect(server1.token).not.toBe(server2.token);

    await Promise.all([server1.close(), server2.close()]);
  });
});
