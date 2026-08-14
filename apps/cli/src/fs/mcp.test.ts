import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import {
  readMcpConfig,
  writeMcpConfig,
  addMcpServer,
  removeMcpServer,
  readClaudeJson,
  parseMcpListNames,
  runClaudeMcpList,
  getMergedMcpServers,
} from "./mcp.js";
import * as backups from "./backups.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// Real fixture text from `claude mcp list` run on this machine (T0.1)
const CLAUDE_MCP_LIST_FIXTURE = `Checking MCP server health…

claude.ai WordPress.com: https://public-api.wordpress.com/wpcom/v2/mcp/v1 - ! Needs authentication
claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ! Needs authentication
chrome-devtools: npx -y chrome-devtools-mcp@latest - ✔ Connected
agentmemory: npx -y @agentmemory/mcp - ✔ Connected`;

// Mock backupFile
vi.mock("./backups", () => ({
  backupFile: vi.fn().mockResolvedValue(undefined),
}));

const testDir = resolve(homedir(), ".claude-test-mcp");

/** Force file-write fallback so unit tests don't invoke the real Claude CLI. */
async function missingCliRunner(): Promise<string> {
  const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
  err.code = "ENOENT";
  throw err;
}

async function cleanup() {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("MCP fs layer", () => {
  beforeEach(async () => {
    await cleanup();
    await mkdir(testDir, { recursive: true });
    // Mock process.env.CLAUDE_ROOT for scoped.ts
    vi.stubEnv("CLAUDE_ROOT", testDir);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("readMcpConfig", () => {
    it("should return empty config when file does not exist", async () => {
      const config = await readMcpConfig("user");
      expect(config.mcpServers).toEqual({});
    });

    it("should parse valid mcp config", async () => {
      const mcpPath = join(testDir, ".mcp.json");
      const validConfig = {
        mcpServers: {
          server1: {
            name: "server1",
            transport: {
              type: "stdio",
              command: "python",
            },
          },
        },
      };
      await writeFile(mcpPath, JSON.stringify(validConfig));

      const config = await readMcpConfig("user");
      expect(config.mcpServers.server1.name).toBe("server1");
    });

    it("should throw on malformed config", async () => {
      const mcpPath = join(testDir, ".mcp.json");
      await writeFile(mcpPath, "{ invalid json ]");

      await expect(readMcpConfig("user")).rejects.toThrow();
    });

    it("should throw on invalid mcp config structure", async () => {
      const mcpPath = join(testDir, ".mcp.json");
      const invalidConfig = {
        mcpServers: {
          bad: {
            // missing required fields
          },
        },
      };
      await writeFile(mcpPath, JSON.stringify(invalidConfig));

      await expect(readMcpConfig("user")).rejects.toThrow("Invalid MCP config");
    });
  });

  describe("writeMcpConfig", () => {
    it("should write valid config", async () => {
      const config = {
        mcpServers: {
          server1: {
            name: "server1",
            transport: {
              type: "stdio",
              command: "python",
            },
          },
        },
      };

      await writeMcpConfig(config, "user");

      const readBack = await readMcpConfig("user");
      expect(readBack.mcpServers.server1.name).toBe("server1");
    });

    it("should backup existing file before writing", async () => {
      const mcpPath = join(testDir, ".mcp.json");
      const oldConfig = {
        mcpServers: {
          old: {
            name: "old",
            transport: {
              type: "stdio",
              command: "old",
            },
          },
        },
      };

      await writeFile(mcpPath, JSON.stringify(oldConfig));

      const newConfig = {
        mcpServers: {
          new: {
            name: "new",
            transport: {
              type: "http",
              url: "http://localhost:3000",
            },
          },
        },
      };

      await writeMcpConfig(newConfig, "user");

      // Verify backup was called
      expect(backups.backupFile).toHaveBeenCalledWith(mcpPath);
    });

    it("should reject invalid config", async () => {
      const invalidConfig = {
        mcpServers: {
          bad: {
            // missing required fields
          },
        },
      };

      await expect(writeMcpConfig(invalidConfig, "user")).rejects.toThrow();
    });
  });

  describe("addMcpServer", () => {
    it("should add a new server", async () => {
      await addMcpServer(
        "server1",
        {
          transport: {
            type: "stdio",
            command: "python",
          },
        },
        "user",
        missingCliRunner,
      );

      const config = await readMcpConfig("user");
      expect(config.mcpServers.server1).toBeDefined();
      expect(config.mcpServers.server1.name).toBe("server1");
    });

    it("should replace existing server", async () => {
      await addMcpServer(
        "server1",
        {
          transport: {
            type: "stdio",
            command: "python",
          },
        },
        "user",
        missingCliRunner,
      );

      await addMcpServer(
        "server1",
        {
          transport: {
            type: "http",
            url: "http://localhost:3000",
          },
        },
        "user",
        missingCliRunner,
      );

      const config = await readMcpConfig("user");
      expect(config.mcpServers.server1.transport.type).toBe("http");
    });

    it("should reject invalid server", async () => {
      await expect(
        addMcpServer(
          "server1",
          {
            // missing transport
          },
          "user",
          missingCliRunner,
        ),
      ).rejects.toThrow();
    });

    it("should prefer claude mcp add-json when CLI is available", async () => {
      const calls: string[][] = [];
      const runner = async (_cmd: string, args: string[]) => {
        calls.push(args);
        return "ok";
      };

      await addMcpServer(
        "cli-server",
        { transport: { type: "stdio", command: "npx", args: ["-y", "demo"] } },
        "user",
        runner,
      );

      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe("mcp");
      expect(calls[0][1]).toBe("add-json");
      expect(calls[0][2]).toBe("cli-server");
      expect(JSON.parse(calls[0][3])).toEqual({
        type: "stdio",
        command: "npx",
        args: ["-y", "demo"],
      });
      expect(calls[0][4]).toBe("-s");
      expect(calls[0][5]).toBe("user");

      // CLI path must not write the test .mcp.json
      const config = await readMcpConfig("user");
      expect(config.mcpServers["cli-server"]).toBeUndefined();
    });
  });

  describe("removeMcpServer", () => {
    it("should remove a server", async () => {
      await addMcpServer(
        "server1",
        {
          transport: {
            type: "stdio",
            command: "python",
          },
        },
        "user",
        missingCliRunner,
      );

      await removeMcpServer("server1", "user", missingCliRunner);

      const config = await readMcpConfig("user");
      expect(config.mcpServers.server1).toBeUndefined();
    });

    it("should throw when removing non-existent server", async () => {
      await expect(removeMcpServer("nonexistent", "user", missingCliRunner)).rejects.toThrow(
        "not found",
      );
    });

    it("should prefer claude mcp remove when CLI is available", async () => {
      const calls: string[][] = [];
      const runner = async (_cmd: string, args: string[]) => {
        calls.push(args);
        return "ok";
      };

      await removeMcpServer("cli-server", "project", runner);

      expect(calls).toEqual([["mcp", "remove", "cli-server", "-s", "project"]]);
    });
  });
});

// ─── Phase 1 tests ────────────────────────────────────────────────────────────

describe("Phase 1 — getMergedMcpServers", () => {
  const scratchDir = resolve(homedir(), ".claude-test-merge");
  const claudeJsonPath = join(scratchDir, "claude.json");

  async function writeClaudeJson(data: object) {
    await mkdir(scratchDir, { recursive: true });
    await writeFile(claudeJsonPath, JSON.stringify(data));
  }

  afterEach(async () => {
    try {
      await rm(scratchDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // T1.1 — readClaudeJson
  describe("readClaudeJson (T1.1)", () => {
    it("returns empty maps when file does not exist", async () => {
      const result = await readClaudeJson("/nonexistent/path/claude.json");
      expect(result.user).toEqual({});
      expect(result.local).toEqual({});
    });

    it("returns user-scope servers from top-level mcpServers", async () => {
      await writeClaudeJson({
        mcpServers: {
          "chrome-devtools": {
            type: "stdio",
            command: "npx",
            args: ["-y", "chrome-devtools-mcp@latest"],
          },
          agentmemory: { type: "stdio", command: "npx", args: ["-y", "@agentmemory/mcp"] },
        },
      });
      const result = await readClaudeJson(claudeJsonPath);
      expect(Object.keys(result.user)).toContain("chrome-devtools");
      expect(Object.keys(result.user)).toContain("agentmemory");
      expect(result.user["chrome-devtools"].command).toBe("npx");
    });

    it("returns local-scope servers from projects[cwd].mcpServers", async () => {
      const cwd = "/fake/project";
      await writeClaudeJson({
        mcpServers: {},
        projects: {
          [cwd]: {
            mcpServers: { "local-server": { type: "stdio", command: "node" } },
          },
        },
      });
      const result = await readClaudeJson(claudeJsonPath, cwd);
      expect(Object.keys(result.local)).toContain("local-server");
    });

    it("is tolerant of malformed JSON (warns, returns empty)", async () => {
      await mkdir(scratchDir, { recursive: true });
      await writeFile(claudeJsonPath, "{ bad json ]");
      // Should not throw
      const result = await readClaudeJson(claudeJsonPath);
      expect(result.user).toEqual({});
      expect(result.local).toEqual({});
    });

    // T1.1 verification: real machine snapshot
    it("finds chrome-devtools and agentmemory with scope user from real ~/.claude.json", async () => {
      const realPath = join(homedir(), ".claude.json");
      const result = await readClaudeJson(realPath);
      expect(Object.keys(result.user)).toContain("chrome-devtools");
      expect(Object.keys(result.user)).toContain("agentmemory");
    });
  });

  // T1.2 — parseMcpListNames + runClaudeMcpList
  describe("parseMcpListNames (T1.2)", () => {
    it("extracts server names from claude mcp list output", () => {
      const names = parseMcpListNames(CLAUDE_MCP_LIST_FIXTURE);
      expect(names).toContain("chrome-devtools");
      expect(names).toContain("agentmemory");
      expect(names).toContain("claude.ai WordPress.com");
      expect(names).toContain("claude.ai Google Drive");
    });

    it("ignores the banner line", () => {
      const names = parseMcpListNames(CLAUDE_MCP_LIST_FIXTURE);
      expect(names).not.toContain("Checking MCP server health…");
    });
  });

  describe("runClaudeMcpList with stubbed runner (T1.2)", () => {
    it("returns names from CLI output", async () => {
      const stubbedRunner = async () => CLAUDE_MCP_LIST_FIXTURE;
      const result = await runClaudeMcpList(stubbedRunner);
      expect(result.names).toContain("chrome-devtools");
      expect(result.names).toContain("agentmemory");
    });

    it("returns empty list when CLI is missing (ENOENT)", async () => {
      const enoentRunner = async () => {
        const err = Object.assign(new Error("not found"), { code: "ENOENT" });
        throw err;
      };
      const result = await runClaudeMcpList(enoentRunner);
      expect(result.names).toEqual([]);
    });

    it("SYNTHETIC: tags name only in CLI output as plugin origin (T1.2 plugin detection)", async () => {
      // Synthetic fixture: 'plugin-only-server' exists in CLI but not in any file source
      const syntheticCliOutput = `chrome-devtools: npx -y chrome-devtools-mcp@latest - ✔ Connected\nplugin-only-server: some-plugin - ✔ Connected`;
      await writeClaudeJson({
        mcpServers: {
          "chrome-devtools": {
            type: "stdio",
            command: "npx",
            args: ["-y", "chrome-devtools-mcp@latest"],
          },
        },
      });
      const servers = await getMergedMcpServers({
        claudeJsonPath,
        projectDir: "/fake/cwd",
        cliRunner: async () => syntheticCliOutput,
      });
      const plugin = servers.find((s) => s.name === "plugin-only-server");
      expect(plugin).toBeDefined();
      expect(plugin?.origin).toBe("plugin");
      expect(plugin?.editable).toBe(false);
    });
  });

  // T1.3 — de-dupe + merge, file wins
  describe("getMergedMcpServers de-dupe (T1.3)", () => {
    it("server present in both file and CLI appears exactly once with file config", async () => {
      await writeClaudeJson({
        mcpServers: {
          "chrome-devtools": {
            type: "stdio",
            command: "npx",
            args: ["-y", "chrome-devtools-mcp@latest"],
          },
        },
      });
      const stubbedRunner = async () => CLAUDE_MCP_LIST_FIXTURE;
      const servers = await getMergedMcpServers({
        claudeJsonPath,
        projectDir: "/fake/cwd",
        cliRunner: stubbedRunner,
      });
      const matches = servers.filter((s) => s.name === "chrome-devtools");
      expect(matches).toHaveLength(1);
      expect(matches[0].origin).toBe("file");
      expect(matches[0].command).toBe("npx");
    });

    it("local scope overrides user scope for same name", async () => {
      const cwd = "/my/project";
      await writeClaudeJson({
        mcpServers: {
          "shared-server": { type: "stdio", command: "user-cmd" },
        },
        projects: {
          [cwd]: {
            mcpServers: {
              "shared-server": { type: "stdio", command: "local-cmd" },
            },
          },
        },
      });
      const servers = await getMergedMcpServers({
        claudeJsonPath,
        projectDir: cwd,
        cliRunner: async () => "",
      });
      const s = servers.find((x) => x.name === "shared-server");
      expect(s?.scope).toBe("local");
      expect(s?.command).toBe("local-cmd");
    });
  });

  // T1.4 — regression against real machine
  describe("Real machine regression (T1.4)", () => {
    it("returns chrome-devtools and agentmemory from real ~/.claude.json", async () => {
      const realPath = join(homedir(), ".claude.json");
      const servers = await getMergedMcpServers({
        claudeJsonPath: realPath,
        // Use a no-op CLI runner to avoid slow network in tests
        cliRunner: async () => "",
      });
      const names = servers.map((s) => s.name);
      expect(names).toContain("chrome-devtools");
      expect(names).toContain("agentmemory");
    });
  });
});
