import { describe, it, expect } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMcpListOutput, queryMcpHealth } from "./mcpHealth.js";

const FIXTURE_PATH = join(import.meta.dirname, "__fixtures__/claude-mcp-list.txt");
const FIXTURE = readFileSync(FIXTURE_PATH, "utf8");
const TIMESTAMP = "2024-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// T2.1 — parser
// ---------------------------------------------------------------------------

describe("parseMcpListOutput", () => {
  it("maps all four real fixture lines to correct statuses", () => {
    const result = parseMcpListOutput(FIXTURE, TIMESTAMP);

    expect(Object.keys(result)).toHaveLength(4);

    expect(result["chrome-devtools"].status).toBe("connected");
    expect(result["agentmemory"].status).toBe("connected");
    expect(result["claude.ai WordPress.com"].status).toBe("unknown");
    expect(result["claude.ai WordPress.com"].message).toBe("Needs authentication");
    expect(result["claude.ai Google Drive"].status).toBe("unknown");
    expect(result["claude.ai Google Drive"].message).toBe("Needs authentication");
  });

  it("attaches the provided timestamp to every entry", () => {
    const result = parseMcpListOutput(FIXTURE, TIMESTAMP);
    for (const entry of Object.values(result)) {
      expect(entry.timestamp).toBe(TIMESTAMP);
    }
  });

  it("tolerates the Checking banner line without creating a spurious entry", () => {
    const result = parseMcpListOutput(FIXTURE, TIMESTAMP);
    const keys = Object.keys(result);
    expect(keys.some((k) => k.toLowerCase().includes("checking"))).toBe(false);
  });

  it("maps a constructed failed/disconnected line", () => {
    const input = "my-server: /usr/bin/tool - ✘ Disconnected\n";
    const result = parseMcpListOutput(input, TIMESTAMP);
    expect(result["my-server"].status).toBe("failed");
  });

  it("returns empty object for empty input", () => {
    expect(parseMcpListOutput("", TIMESTAMP)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// T2.2 — CLI-missing / timeout handling
// ---------------------------------------------------------------------------

describe("queryMcpHealth", () => {
  it("returns { available: true, status: {...} } when CLI succeeds", async () => {
    const runner = async () => ({ stdout: FIXTURE });
    const result = await queryMcpHealth(runner);

    expect(result.available).toBe(true);
    expect(Object.keys(result.status)).toHaveLength(4);
    expect(result.status["chrome-devtools"].status).toBe("connected");
  });

  it("returns { available: false, status: {} } when CLI is not found (ENOENT) without throwing", async () => {
    const runner = async (): Promise<{ stdout: string }> => {
      const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    };

    // Must not throw
    const result = await queryMcpHealth(runner);
    expect(result.available).toBe(false);
    expect(result.status).toEqual({});
  });

  it("returns { available: false, status: {} } on timeout without throwing", async () => {
    const runner = async (): Promise<{ stdout: string }> => {
      const err = new Error("Command timed out") as NodeJS.ErrnoException & { killed?: boolean };
      err.killed = true;
      throw err;
    };

    const result = await queryMcpHealth(runner);
    expect(result.available).toBe(false);
    expect(result.status).toEqual({});
  });

  it("parses stdout even when CLI exits non-zero", async () => {
    const runner = async (): Promise<{ stdout: string }> => {
      const err = Object.assign(new Error("exit 1"), { stdout: FIXTURE });
      throw err;
    };

    const result = await queryMcpHealth(runner);
    expect(result.available).toBe(true);
    expect(result.status["agentmemory"].status).toBe("connected");
  });
});
