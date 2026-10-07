import { describe, expect, it, afterEach } from "vite-plus/test";
import { Hono } from "hono";
import { createToken, requireBearerToken, registerSecurity } from "./auth.js";

describe("createToken", () => {
  it("generates a 64-character hex string", () => {
    const token = createToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates different tokens on each call", () => {
    const token1 = createToken();
    const token2 = createToken();
    const token3 = createToken();
    expect(token1).not.toBe(token2);
    expect(token2).not.toBe(token3);
  });

  it("uses cryptographically secure randomness", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => createToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("requireBearerToken", () => {
  afterEach(() => {
    delete process.env.CC_STUDIO_INSECURE;
  });

  it("allows access to /api/lifecycle with correct access_token query param", async () => {
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/api/lifecycle", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost/api/lifecycle?access_token=test-token-123");
    expect(res.status).toBe(200);
  });

  it("rejects /api/lifecycle with missing access_token", async () => {
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/api/lifecycle", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost/api/lifecycle");
    expect(res.status).toBe(401);
  });

  it("rejects /api/lifecycle with wrong access_token", async () => {
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/api/lifecycle", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost/api/lifecycle?access_token=wrong-token");
    expect(res.status).toBe(401);
  });

  it("allows access with correct Bearer token in Authorization header", async () => {
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/api/health", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost/api/health", {
      headers: { Authorization: "Bearer test-token-123" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects missing Bearer token in Authorization header", async () => {
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/api/health", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost/api/health");
    expect(res.status).toBe(401);
  });

  it("rejects wrong Bearer token in Authorization header", async () => {
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/api/health", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost/api/health", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("allows non-API routes without token", async () => {
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/", (c) => c.text("ok"));

    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
  });

  it("allows access when CC_STUDIO_INSECURE is set", async () => {
    process.env.CC_STUDIO_INSECURE = "1";
    const token = "test-token-123";
    const app = new Hono();
    app.use("*", requireBearerToken(token));

    app.get("/api/health", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost/api/health");
    expect(res.status).toBe(200);
  });
});

describe("registerSecurity", () => {
  it("allows localhost requests", async () => {
    const app = new Hono();
    registerSecurity(app);
    app.get("*", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost:3000/test", {
      headers: { Host: "localhost" },
    });
    expect(res.status).toBe(200);
  });

  it("allows 127.0.0.1 requests", async () => {
    const app = new Hono();
    registerSecurity(app);
    app.get("*", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://127.0.0.1:3000/test", {
      headers: { Host: "127.0.0.1" },
    });
    expect(res.status).toBe(200);
  });

  it("allows IPv6 loopback requests", async () => {
    const app = new Hono();
    registerSecurity(app);
    app.get("*", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://[::1]:3000/test", {
      headers: { Host: "[::1]" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects remote host requests", async () => {
    const app = new Hono();
    registerSecurity(app);
    app.get("*", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://example.com:3000/test", {
      headers: { Host: "example.com" },
    });
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("forbidden_host");
  });

  it("rejects non-loopback origin", async () => {
    const app = new Hono();
    registerSecurity(app);
    app.get("*", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost:3000/test", {
      headers: {
        Host: "localhost",
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("forbidden_origin");
  });

  it("allows loopback origin", async () => {
    const app = new Hono();
    registerSecurity(app);
    app.get("*", (c) => c.json({ status: "ok" }));

    const res = await app.request("http://localhost:3000/test", {
      headers: {
        Host: "localhost",
        Origin: "http://localhost:3001",
      },
    });
    expect(res.status).toBe(200);
  });
});
