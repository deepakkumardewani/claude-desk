import { describe, expect, it } from "vite-plus/test";
import { createApp } from "./server.js";

describe("createApp", () => {
  it("throws when no token is provided", () => {
    expect(() => createApp({ token: "" })).toThrow("token is required");
  });

  it("creates an app instance with a valid token", () => {
    const app = createApp({ token: "test-token-123" });
    expect(app).toBeDefined();
  });

  it("serves /api/health with correct bearer token", async () => {
    const app = createApp({ token: "test-token-123" });

    const res = await app.request("http://127.0.0.1/api/health", {
      headers: { Authorization: "Bearer test-token-123" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; service: string };
    expect(data.ok).toBe(true);
    expect(data.service).toBe("cli");
  });

  it("requires bearer token for /api/settings", async () => {
    const app = createApp({ token: "test-token-123" });

    const res = await app.request("http://127.0.0.1/api/settings");
    expect(res.status).toBe(401);
  });

  it("allows access to /api/settings with correct bearer token", async () => {
    const app = createApp({ token: "test-token-123" });

    const res = await app.request("http://127.0.0.1/api/settings", {
      headers: { Authorization: "Bearer test-token-123" },
    });
    // This might return 400 or 500 depending on scope parsing, but not 401
    expect(res.status).not.toBe(401);
  });

  it("rejects requests with wrong bearer token", async () => {
    const app = createApp({ token: "test-token-123" });

    const res = await app.request("http://127.0.0.1/api/settings", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects /api/health with wrong token", async () => {
    const app = createApp({ token: "test-token-123" });

    const res = await app.request("http://127.0.0.1/api/health", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("requires bearer token in Authorization header for /api/tree", async () => {
    const app = createApp({ token: "test-token-123" });

    const res = await app.request("http://127.0.0.1/api/tree");
    expect(res.status).toBe(401);
  });

  it("allows requests to non-API routes without token", async () => {
    const app = createApp({ token: "test-token-123" });

    const res = await app.request("http://127.0.0.1/");
    expect(res.status).not.toBe(401);
  });

  it("allows access when CC_STUDIO_INSECURE is set to 1", async () => {
    process.env.CC_STUDIO_INSECURE = "1";
    try {
      const app = createApp({ token: "test-token-123" });

      const res = await app.request("http://127.0.0.1/api/settings");
      expect(res.status).not.toBe(401);
    } finally {
      delete process.env.CC_STUDIO_INSECURE;
    }
  });
});
