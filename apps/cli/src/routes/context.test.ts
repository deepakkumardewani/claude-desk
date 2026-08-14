import { describe, expect, test } from "vite-plus/test";
import { createApp } from "../server.js";

const TEST_TOKEN = "a".repeat(64);
const AUTH = { Authorization: `Bearer ${TEST_TOKEN}` };

describe("/api/context", () => {
  test("returns graceful error when claude CLI not in PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";

    try {
      const app = createApp({ token: TEST_TOKEN });
      const response = await app.request("/api/context", { headers: AUTH });
      expect(response.status).toBe(200);

      const body = (await response.json()) as { success: boolean; error?: string };
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe("string");
      expect(body.error!.length).toBeGreaterThan(0);
    } finally {
      process.env.PATH = originalPath;
    }
  }, 10_000);
});

describe("/api/context/all", () => {
  test("returns graceful error when claude CLI not in PATH", async () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";

    try {
      const app = createApp({ token: TEST_TOKEN });
      const response = await app.request("/api/context/all", { headers: AUTH });
      expect(response.status).toBe(200);

      const body = (await response.json()) as { success: boolean; error?: string };
      expect(body.success).toBe(false);
      expect(typeof body.error).toBe("string");
      expect(body.error!.length).toBeGreaterThan(0);
    } finally {
      process.env.PATH = originalPath;
    }
  }, 10_000);
});
