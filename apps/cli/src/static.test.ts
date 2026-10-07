import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vite-plus/test";
import { Hono } from "hono";
import { mountStatic, resolveWebDistDir } from "./static.js";

describe("resolveWebDistDir", () => {
  it("throws error when web dist is not found", () => {
    const fakeUrl = "file:///fake/path/to/nonexistent/module.js";
    expect(() => resolveWebDistDir(fakeUrl)).toThrow(/web dist not found/);
  });
});

describe("mountStatic", () => {
  let tempWebDir: string;

  afterEach(() => {
    if (tempWebDir) {
      rmSync(tempWebDir, { recursive: true, force: true });
    }
  });

  it("serves index.html for root path", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html><body>Hello</body></html>");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Hello");
  });

  it("serves nested files correctly", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html></html>");
    writeFileSync(join(tempWebDir, "style.css"), "body { color: red; }");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/style.css");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("color: red");
  });

  it("rejects path traversal attempts and serves SPA fallback", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html><body>SPA</body></html>");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    // Path traversal is rejected, SPA fallback is served
    const res = await app.request("http://localhost/../../../etc/passwd");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("SPA");
  });

  it("injects lifecycle script into HTML files", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html><body></body></html>");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/");
    const body = await res.text();
    expect(body).toContain("EventSource");
    expect(body).toContain("sessionStorage");
  });

  it("does not inject script if /api/lifecycle already present in HTML", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    const htmlWithLifecyclePath = "<html><body>Link: /api/lifecycle</body></html>";
    writeFileSync(join(tempWebDir, "index.html"), htmlWithLifecyclePath);

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/");
    const body = await res.text();
    // When /api/lifecycle is already in the HTML, no script injection happens
    expect(body).not.toContain("EventSource");
    expect(body).toContain("/api/lifecycle");
  });

  it("serves SPA fallback for non-existent JS files (client-side routing)", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html></html>");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/nonexistent.js");
    expect(res.status).toBe(200);
  });

  it("serves SPA fallback for unknown routes", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html><body>SPA</body></html>");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/any/unknown/route");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("SPA");
  });

  it("rejects API requests", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html></html>");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/api/health");
    expect(res.status).toBe(404);
  });

  it("serves CSS files with correct MIME type", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html></html>");
    writeFileSync(join(tempWebDir, "app.css"), "body { margin: 0; }");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/app.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  it("serves JS files with correct MIME type", async () => {
    tempWebDir = mkdtempSync(join(tmpdir(), "web-test-"));
    writeFileSync(join(tempWebDir, "index.html"), "<html></html>");
    writeFileSync(join(tempWebDir, "app.js"), "console.log('hi');");

    const app = new Hono();
    mountStatic(app, tempWebDir);

    const res = await app.request("http://localhost/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });
});
