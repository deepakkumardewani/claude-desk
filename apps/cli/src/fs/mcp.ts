import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Scope } from "schema";
import { safeParseMcpConfig, mcpServerSchema } from "schema";
import { backupFile } from "./backups.js";
import { safePath } from "./scoped.js";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

export type McpOrigin = "file" | "plugin";

export interface MergedMcpServer {
  name: string;
  /** Transport config sourced from the file; plugins won't have this until health is fetched */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
  scope: Scope | "local";
  /** 'file' = found in ~/.claude.json or .mcp.json; 'plugin' = only in `claude mcp list` output */
  origin: McpOrigin;
  /** Plugin-origin servers are read-only */
  editable: boolean;
}

// ─── ~/.claude.json reader ────────────────────────────────────────────────────

/**
 * Raw server shape inside ~/.claude.json
 * e.g. { type: "stdio", command: "npx", args: [...], env: {} }
 */
interface RawClaudeJsonServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

interface ClaudeJson {
  mcpServers?: Record<string, RawClaudeJsonServer>;
  projects?: Record<string, { mcpServers?: Record<string, RawClaudeJsonServer> }>;
}

/**
 * Read MCP servers from ~/.claude.json.
 * Returns user-scope servers and optionally local-scope servers keyed by cwd path.
 * Tolerant of a missing file or malformed JSON — warns instead of throwing.
 */
export async function readClaudeJson(
  claudeJsonPath = join(homedir(), ".claude.json"),
  cwd = process.cwd(),
): Promise<{
  user: Record<string, RawClaudeJsonServer>;
  local: Record<string, RawClaudeJsonServer>;
}> {
  let raw: ClaudeJson = {};

  try {
    const content = await readFile(claudeJsonPath, "utf-8");
    raw = JSON.parse(content) as ClaudeJson;
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist — not an error
    } else {
      console.warn(
        "[mcp] Could not parse ~/.claude.json:",
        error instanceof Error ? error.message : error,
      );
    }
    return { user: {}, local: {} };
  }

  const user = raw.mcpServers ?? {};
  const local = raw.projects?.[cwd]?.mcpServers ?? {};
  return { user, local };
}

// ─── claude mcp list runner ──────────────────────────────────────────────────

/** Names extracted from `claude mcp list` output */
export interface CliMcpList {
  names: string[];
}

/**
 * Shell out to `claude mcp list` and return server names.
 * Tolerant of ENOENT (CLI not installed) — returns empty list.
 */
export async function runClaudeMcpList(
  runner: (cmd: string, args: string[]) => Promise<string> = defaultRunner,
): Promise<CliMcpList> {
  try {
    const stdout = await runner("claude", ["mcp", "list"]);
    return { names: parseMcpListNames(stdout) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // claude CLI not installed — skip plugin detection
      return { names: [] };
    }
    console.warn("[mcp] claude mcp list failed:", error instanceof Error ? error.message : error);
    return { names: [] };
  }
}

export type ClaudeCliRunner = (cmd: string, args: string[]) => Promise<string>;

async function defaultRunner(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { timeout: 60_000 });
  return stdout;
}

function isCliMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Convert our schema server (name + transport) into the JSON body
 * `claude mcp add-json` expects (flat transport, no name wrapper).
 */
export function toClaudeAddJsonPayload(server: {
  transport: {
    type: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    timeout?: number;
  };
}): Record<string, unknown> {
  const { transport } = server;
  if (transport.type === "stdio") {
    return {
      type: "stdio",
      command: transport.command,
      ...(transport.args ? { args: transport.args } : {}),
      ...(transport.env ? { env: transport.env } : {}),
    };
  }
  return {
    type: transport.type,
    url: transport.url,
    ...(transport.headers ? { headers: transport.headers } : {}),
    ...(transport.timeout !== undefined ? { timeout: transport.timeout } : {}),
  };
}

/**
 * Parse names from `claude mcp list` output.
 * Lines look like: `chrome-devtools: npx -y chrome-devtools-mcp@latest - ✔ Connected`
 * The name is the text before the first ": ".
 */
export function parseMcpListNames(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(": "))
    .map((line) => line.split(": ")[0].trim())
    .filter(Boolean);
}

// ─── Merge ───────────────────────────────────────────────────────────────────

/**
 * Build the merged server list from file sources + CLI.
 * - Reads ~/.claude.json for user-scope and local-scope servers
 * - Reads .mcp.json for project-scope servers (existing readMcpConfig path)
 * - Shells out to `claude mcp list` for plugin-origin detection
 * - File sources win for config/scope when a name appears in both
 * - Names only in CLI output are tagged origin: 'plugin', editable: false
 *
 * @param opts.claudeJsonPath - override ~/.claude.json path (for testing)
 * @param opts.cwd            - override process.cwd() (for testing)
 * @param opts.cliRunner      - override CLI runner (for testing)
 */
export async function getMergedMcpServers(
  opts: {
    claudeJsonPath?: string;
    cwd?: string;
    cliRunner?: (cmd: string, args: string[]) => Promise<string>;
  } = {},
): Promise<MergedMcpServer[]> {
  const cwd = opts.cwd ?? process.cwd();

  const [{ user, local }, { names: cliNames }] = await Promise.all([
    readClaudeJson(opts.claudeJsonPath, cwd),
    runClaudeMcpList(opts.cliRunner),
  ]);

  const merged = new Map<string, MergedMcpServer>();

  // User-scope servers from ~/.claude.json
  for (const [name, raw] of Object.entries(user)) {
    merged.set(name, { name, ...raw, scope: "user", origin: "file", editable: true });
  }

  // Local-scope servers override user-scope (same key = local wins)
  for (const [name, raw] of Object.entries(local)) {
    merged.set(name, { name, ...raw, scope: "local", origin: "file", editable: true });
  }

  // Plugin-origin: names in CLI output not present in any file source
  for (const name of cliNames) {
    if (!merged.has(name)) {
      merged.set(name, { name, scope: "user", origin: "plugin", editable: false });
    }
    // If already in file sources, file config wins — don't overwrite
  }

  return Array.from(merged.values());
}

/**
 * Get the path to .mcp.json in a given scope
 */
function getMcpPath(scope: Scope = "user"): string {
  // Use a custom category for mcp config
  // Since scoped.ts doesn't have mcp as a category, we'll resolve it manually
  return join(safePath("settings", "", scope), "..", ".mcp.json");
}

/**
 * Read MCP config from the given scope
 * Returns empty config if file doesn't exist
 */
export async function readMcpConfig(scope: Scope = "user") {
  const mcpPath = getMcpPath(scope);

  try {
    await stat(mcpPath);
    const content = await readFile(mcpPath, "utf-8");
    const parsed = JSON.parse(content);
    const result = safeParseMcpConfig(parsed);

    if (!result.success) {
      throw new Error(`Invalid MCP config: ${result.error.message}`);
    }

    return result.data;
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      // File doesn't exist, return empty config
      return { mcpServers: {} };
    }
    throw error;
  }
}

/**
 * Write MCP config to the given scope
 * Creates a backup of the existing file before writing (if it exists)
 */
export async function writeMcpConfig(config: unknown, scope: Scope = "user") {
  const mcpPath = getMcpPath(scope);

  // Validate the config before writing
  const result = safeParseMcpConfig(config);
  if (!result.success) {
    throw new Error(`Invalid MCP config: ${result.error.message}`);
  }

  // Create backup of existing file if it exists
  try {
    await stat(mcpPath);
    await backupFile(mcpPath);
  } catch {
    // File doesn't exist, no backup needed
  }

  // Write the new config
  const content = JSON.stringify(result.data, null, 2);
  await writeFile(mcpPath, content, "utf-8");
}

/**
 * Add or update an MCP server (AC5 dual-path).
 * Prefer `claude mcp add-json`; on ENOENT (CLI missing) fall back to writeMcpConfig.
 */
export async function addMcpServer(
  name: string,
  server: any,
  scope: Scope = "user",
  runner: ClaudeCliRunner = defaultRunner,
) {
  const serverResult = mcpServerSchema.safeParse({
    name,
    ...server,
  });

  if (!serverResult.success) {
    throw new Error(`Invalid server config: ${serverResult.error.message}`);
  }

  const payload = toClaudeAddJsonPayload(serverResult.data);
  try {
    await runner("claude", ["mcp", "add-json", name, JSON.stringify(payload), "-s", scope]);
    return;
  } catch (error) {
    if (!isCliMissing(error)) {
      throw error;
    }
  }

  const config = await readMcpConfig(scope);
  config.mcpServers[name] = serverResult.data;
  await writeMcpConfig(config, scope);
}

/**
 * Remove an MCP server (AC5 dual-path).
 * Prefer `claude mcp remove`; on ENOENT (CLI missing) fall back to writeMcpConfig.
 */
export async function removeMcpServer(
  name: string,
  scope: Scope = "user",
  runner: ClaudeCliRunner = defaultRunner,
) {
  try {
    await runner("claude", ["mcp", "remove", name, "-s", scope]);
    return;
  } catch (error) {
    if (!isCliMissing(error)) {
      throw error;
    }
  }

  const config = await readMcpConfig(scope);

  if (!config.mcpServers[name]) {
    throw new Error(`Server "${name}" not found in ${scope} scope`);
  }

  delete config.mcpServers[name];
  await writeMcpConfig(config, scope);
}

/**
 * Get all servers across both scopes (user and project if available)
 * Servers from project scope override those from user scope
 */
export async function getAllMcpServers(includeProject = true) {
  const userConfig = await readMcpConfig("user");
  const servers: Record<string, { server: any; scope: Scope }> = {};

  // Add user servers
  for (const [name, server] of Object.entries(userConfig.mcpServers || {})) {
    servers[name] = { server, scope: "user" };
  }

  // Add/override with project servers if they exist
  if (includeProject) {
    try {
      const projectConfig = await readMcpConfig("project");
      for (const [name, server] of Object.entries(projectConfig.mcpServers || {})) {
        servers[name] = { server, scope: "project" };
      }
    } catch {
      // Project scope doesn't exist or can't be read, just use user servers
    }
  }

  return servers;
}
