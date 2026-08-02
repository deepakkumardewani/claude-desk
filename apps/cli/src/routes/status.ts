import { execSync } from "node:child_process";
import { safeParseSettings, type StatusItem, type StatusResponse } from "schema";
import { readFileText } from "../fs/scoped.js";

async function getClaudeCliStatus(): Promise<StatusItem> {
  try {
    const version = execSync("claude --version").toString().trim();
    return {
      id: "claude-cli",
      label: "Claude CLI",
      status: "ok",
      message: `Installed: ${version}`,
    };
  } catch {
    return {
      id: "claude-cli",
      label: "Claude CLI",
      status: "missing",
      message: "Claude CLI is not installed or not in PATH",
      fixRoute: "/settings",
    };
  }
}

async function getSettingsStatus(): Promise<StatusItem> {
  try {
    const raw = await readFileText("settings", "", "user");
    const parsedJson = JSON.parse(raw) as unknown;
    const result = safeParseSettings(parsedJson);

    if (!result.success) {
      return {
        id: "settings",
        label: "settings.json",
        status: "warn",
        message: "settings.json is malformed",
        fixRoute: "/settings",
      };
    }

    return {
      id: "settings",
      label: "settings.json",
      status: "ok",
      message: "Valid settings.json found",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (message.includes("ENOENT") || message.includes("file not found")) {
      return {
        id: "settings",
        label: "settings.json",
        status: "warn",
        message: "settings.json not found",
        fixRoute: "/settings",
      };
    }
    return {
      id: "settings",
      label: "settings.json",
      status: "warn",
      message: "Unable to read settings.json",
      fixRoute: "/settings",
    };
  }
}

async function getClaudeMdStatus(): Promise<StatusItem> {
  try {
    await readFileText("claudeMd", "", "user");
    return {
      id: "claude-md",
      label: "CLAUDE.md",
      status: "ok",
      message: "CLAUDE.md found in ~/.claude",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (message.includes("ENOENT") || message.includes("file not found")) {
      return {
        id: "claude-md",
        label: "CLAUDE.md",
        status: "warn",
        message: "CLAUDE.md not found",
        fixRoute: "/claude-md",
      };
    }
    return {
      id: "claude-md",
      label: "CLAUDE.md",
      status: "warn",
      message: "Unable to read CLAUDE.md",
      fixRoute: "/claude-md",
    };
  }
}

async function getMcpConfigStatus(): Promise<StatusItem> {
  try {
    const raw = await readFileText("settings", "", "user");
    const parsedJson = JSON.parse(raw) as unknown;

    // Check if enabledMcpjsonServers or similar is configured
    if (typeof parsedJson === "object" && parsedJson !== null) {
      const config = parsedJson as Record<string, unknown>;
      const enabledServers = config.enabledMcpjsonServers as unknown[] | undefined;
      const allowedServers = config.allowedMcpServers as unknown[] | undefined;

      if (enabledServers && Array.isArray(enabledServers) && enabledServers.length > 0) {
        return {
          id: "mcp-config",
          label: "MCP Configuration",
          status: "ok",
          message: `${enabledServers.length} MCP server(s) configured`,
        };
      }

      if (allowedServers && Array.isArray(allowedServers) && allowedServers.length > 0) {
        return {
          id: "mcp-config",
          label: "MCP Configuration",
          status: "ok",
          message: `${allowedServers.length} MCP server(s) allowed`,
        };
      }
    }

    return {
      id: "mcp-config",
      label: "MCP Configuration",
      status: "warn",
      message: "No MCP servers configured",
      fixRoute: "/mcp",
    };
  } catch {
    return {
      id: "mcp-config",
      label: "MCP Configuration",
      status: "warn",
      message: "Unable to check MCP configuration",
      fixRoute: "/mcp",
    };
  }
}

async function getPluginsStatus(): Promise<StatusItem> {
  try {
    const raw = await readFileText("settings", "", "user");
    const parsedJson = JSON.parse(raw) as unknown;

    if (typeof parsedJson === "object" && parsedJson !== null) {
      const config = parsedJson as Record<string, unknown>;
      const enabledPlugins = config.enabledPlugins as Record<string, unknown> | undefined;

      if (enabledPlugins && Object.keys(enabledPlugins).length > 0) {
        const count = Object.keys(enabledPlugins).length;
        return {
          id: "plugins",
          label: "Plugins",
          status: "ok",
          message: `${count} plugin(s) enabled`,
        };
      }
    }

    return {
      id: "plugins",
      label: "Plugins",
      status: "warn",
      message: "No plugins enabled",
      fixRoute: "/settings",
    };
  } catch {
    return {
      id: "plugins",
      label: "Plugins",
      status: "warn",
      message: "Unable to check plugin configuration",
      fixRoute: "/settings",
    };
  }
}

export async function getStatusResponse(): Promise<StatusResponse> {
  const items = await Promise.all([
    getClaudeCliStatus(),
    getSettingsStatus(),
    getClaudeMdStatus(),
    getMcpConfigStatus(),
    getPluginsStatus(),
  ]);

  const allOk = items.every((item: StatusItem) => item.status === "ok");

  return {
    allOk,
    items,
  };
}
