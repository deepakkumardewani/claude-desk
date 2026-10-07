import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpConfig, McpScope } from "schema";
import { safeParseMcpConfig, mcpServerSchema } from "schema";
import { backupFile } from "./backups.js";
import { claudeJsonPath } from "./claudePaths.js";
import { requireAbsoluteProjectDir, userClaudeRoot } from "./scoped.js";

const execFileAsync = promisify(execFile);

type McpServerEntry = NonNullable<McpConfig["mcpServers"]>[string];

export type McpOrigin = "file" | "plugin";

export interface MergedMcpServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
  scope: McpScope;
  origin: McpOrigin;
  editable: boolean;
}

interface RawClaudeJsonServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

interface ClaudeJson {
  mcpServers?: Record<string, RawClaudeJsonServer>;
  projects?: Record<string, { mcpServers?: Record<string, RawClaudeJsonServer> }>;
}

export function defaultClaudeJsonPath(): string {
  return claudeJsonPath();
}

export async function readClaudeJson(
  claudeJsonPath = defaultClaudeJsonPath(),
  projectDir?: string,
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
      return { user: {}, local: {} };
    }
    console.warn(
      "[mcp] Could not parse ~/.claude.json:",
      error instanceof Error ? error.message : error,
    );
    return { user: {}, local: {} };
  }

  const user = raw.mcpServers ?? {};
  const local = projectDir ? (raw.projects?.[projectDir]?.mcpServers ?? {}) : {};
  return { user, local };
}

export interface CliMcpList {
  names: string[];
}

export async function runClaudeMcpList(
  runner: (cmd: string, args: string[]) => Promise<string> = defaultRunner,
): Promise<CliMcpList> {
  try {
    const stdout = await runner("claude", ["mcp", "list"]);
    return { names: parseMcpListNames(stdout) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { names: [] };
    }
    console.warn("[mcp] claude mcp list failed:", error instanceof Error ? error.message : error);
    return { names: [] };
  }
}

export type ClaudeCliRunner = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
) => Promise<string>;

async function defaultRunner(
  cmd: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { timeout: 60_000, cwd: opts?.cwd });
  return stdout;
}

function isCliMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

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

export function parseMcpListNames(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(": "))
    .map((line) => line.split(": ")[0].trim())
    .filter(Boolean);
}

export async function getMergedMcpServers(
  opts: {
    claudeJsonPath?: string;
    projectDir?: string;
    cliRunner?: (cmd: string, args: string[]) => Promise<string>;
  } = {},
): Promise<MergedMcpServer[]> {
  const [{ user, local }, { names: cliNames }] = await Promise.all([
    readClaudeJson(opts.claudeJsonPath, opts.projectDir),
    runClaudeMcpList(opts.cliRunner),
  ]);

  const merged = new Map<string, MergedMcpServer>();

  for (const [name, raw] of Object.entries(user)) {
    merged.set(name, { name, ...raw, scope: "user", origin: "file", editable: true });
  }

  for (const [name, raw] of Object.entries(local)) {
    merged.set(name, { name, ...raw, scope: "local", origin: "file", editable: true });
  }

  for (const name of cliNames) {
    if (!merged.has(name)) {
      merged.set(name, { name, scope: "user", origin: "plugin", editable: false });
    }
  }

  return Array.from(merged.values());
}

export function getMcpPath(scope: "user" | "project", projectDir?: string): string {
  if (scope === "user") {
    return join(userClaudeRoot(), ".mcp.json");
  }
  return join(requireAbsoluteProjectDir(projectDir), ".mcp.json");
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mcpServerFromRaw(name: string, raw: RawClaudeJsonServer): McpServerEntry {
  if (raw.type === "sse" || raw.type === "http" || raw.url) {
    return {
      name,
      disabled: false,
      transport: {
        type: raw.type === "sse" ? "sse" : "http",
        url: raw.url ?? "http://localhost",
        ...(raw.headers ? { headers: raw.headers } : {}),
        ...(raw.timeout !== undefined ? { timeout: raw.timeout } : {}),
      },
    };
  }
  return {
    name,
    disabled: false,
    transport: {
      type: "stdio",
      command: raw.command || "unknown",
      ...(raw.args ? { args: raw.args } : {}),
      ...(raw.env ? { env: raw.env } : {}),
    },
  };
}

function invalidMcpEntry(name: string, reason: string): Error {
  return new Error(`Invalid MCP config: server "${name}" ${reason}`);
}

/**
 * Accepts both the legacy app shape ({name, transport}) and the shape Claude Code
 * actually writes ({type, command, args, env} / {type, url, headers}).
 */
export function normalizeMcpEntry(name: string, raw: unknown): McpServerEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalidMcpEntry(name, "must be an object");
  }
  const entry = raw as Record<string, unknown>;
  const candidate =
    "transport" in entry
      ? { name, ...entry }
      : hasLaunchTarget(entry)
        ? mcpServerFromRaw(name, entry as RawClaudeJsonServer)
        : null;
  if (!candidate) {
    throw invalidMcpEntry(name, "needs a command or url");
  }
  const result = mcpServerSchema.safeParse(candidate);
  if (!result.success) {
    throw new Error(`Invalid MCP config: ${result.error.message}`);
  }
  return result.data;
}

// Without a command or url mcpServerFromRaw would silently invent a "unknown" stdio server.
function hasLaunchTarget(entry: Record<string, unknown>): boolean {
  return typeof entry.command === "string" || typeof entry.url === "string";
}

function normalizeMcpServers(parsed: unknown): NonNullable<McpConfig["mcpServers"]> {
  const record = asJsonObject(asJsonObject(parsed).mcpServers);
  const servers: NonNullable<McpConfig["mcpServers"]> = {};
  for (const [name, raw] of Object.entries(record)) {
    servers[name] = normalizeMcpEntry(name, raw);
  }
  return servers;
}

async function backupIfExists(filePath: string): Promise<void> {
  try {
    await stat(filePath);
    await backupFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error(`Invalid JSON file ${filePath}: expected an object`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readLocalMcpConfig(projectDir?: string) {
  const dir = requireAbsoluteProjectDir(projectDir);
  const { local } = await readClaudeJson(defaultClaudeJsonPath(), dir);
  const mcpServers: McpConfig["mcpServers"] = {};
  for (const [name, raw] of Object.entries(local)) {
    mcpServers[name] = mcpServerFromRaw(name, raw);
  }
  return { mcpServers };
}

async function writeLocalMcpConfig(config: McpConfig, projectDir?: string): Promise<void> {
  const dir = requireAbsoluteProjectDir(projectDir);
  const claudeJsonPath = defaultClaudeJsonPath();
  const root = (await readJsonObject(claudeJsonPath)) ?? {};
  const projects = asJsonObject(root.projects);
  const projectEntry = asJsonObject(projects[dir]);
  const mcpServers: Record<string, RawClaudeJsonServer> = {};
  for (const [name, server] of Object.entries(config.mcpServers ?? {})) {
    mcpServers[name] = toClaudeAddJsonPayload(server) as RawClaudeJsonServer;
  }
  projects[dir] = { ...projectEntry, mcpServers };

  await backupIfExists(claudeJsonPath);
  await mkdir(dirname(claudeJsonPath), { recursive: true });
  await writeFile(claudeJsonPath, JSON.stringify({ ...root, projects }, null, 2), "utf-8");
}

export async function readMcpConfig(
  scope: McpScope = "user",
  projectDir?: string,
  preReadConfig?: McpConfig,
) {
  if (preReadConfig !== undefined) {
    return preReadConfig;
  }

  if (scope === "local") {
    return readLocalMcpConfig(projectDir);
  }

  const mcpPath = getMcpPath(scope, projectDir);

  try {
    await stat(mcpPath);
    const content = await readFile(mcpPath, "utf-8");
    return { mcpServers: normalizeMcpServers(JSON.parse(content)) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return { mcpServers: {} };
    }
    throw error;
  }
}

export async function writeMcpConfig(
  config: unknown,
  scope: McpScope = "user",
  projectDir?: string,
) {
  const result = safeParseMcpConfig(config);
  if (!result.success) {
    throw new Error(`Invalid MCP config: ${result.error.message}`);
  }

  if (scope === "local") {
    await writeLocalMcpConfig(result.data, projectDir);
    return;
  }

  const mcpPath = getMcpPath(scope, projectDir);
  // Keep unknown top-level keys so we never drop data Claude Code or the user put there.
  const existing = (await readJsonObject(mcpPath)) ?? {};
  const mcpServers: Record<string, unknown> = {};
  for (const [name, server] of Object.entries(result.data.mcpServers ?? {})) {
    mcpServers[name] = toClaudeAddJsonPayload(server);
  }
  await backupIfExists(mcpPath);
  await mkdir(dirname(mcpPath), { recursive: true });
  await writeFile(mcpPath, JSON.stringify({ ...existing, mcpServers }, null, 2), "utf-8");
}

export async function addMcpServer(
  name: string,
  server: any,
  scope: McpScope = "user",
  runner: ClaudeCliRunner = defaultRunner,
  projectDir?: string,
) {
  const serverResult = mcpServerSchema.safeParse({
    name,
    ...server,
  });

  if (!serverResult.success) {
    throw new Error(`Invalid server config: ${serverResult.error.message}`);
  }

  const payload = toClaudeAddJsonPayload(serverResult.data);
  const cwd = scope === "user" ? undefined : projectDir;
  try {
    await runner("claude", ["mcp", "add-json", name, JSON.stringify(payload), "-s", scope], {
      cwd,
    });
    return;
  } catch (error) {
    if (!isCliMissing(error)) {
      throw error;
    }
  }

  const config = await readMcpConfig(scope, projectDir);
  config.mcpServers[name] = serverResult.data;
  await writeMcpConfig(config, scope, projectDir);
}

export async function removeMcpServer(
  name: string,
  scope: McpScope = "user",
  runner: ClaudeCliRunner = defaultRunner,
  projectDir?: string,
) {
  const cwd = scope === "user" ? undefined : projectDir;
  try {
    await runner("claude", ["mcp", "remove", name, "-s", scope], { cwd });
    return;
  } catch (error) {
    if (!isCliMissing(error)) {
      throw error;
    }
  }

  const config = await readMcpConfig(scope, projectDir);

  if (!config.mcpServers[name]) {
    throw new Error(`Server "${name}" not found in ${scope} scope`);
  }

  delete config.mcpServers[name];
  await writeMcpConfig(config, scope, projectDir);
}

/** .mcp.json servers. Without projectDir, user scope only. Optionally accepts pre-read configs to avoid duplicate file reads. */
export async function getAllMcpServers(
  projectDir?: string,
  opts?: { userConfig?: McpConfig; projectConfig?: McpConfig },
) {
  const userConfig = await readMcpConfig("user", undefined, opts?.userConfig);
  const servers: Record<string, { server: any; scope: McpScope }> = {};

  for (const [name, server] of Object.entries(userConfig.mcpServers || {})) {
    servers[name] = { server, scope: "user" };
  }

  if (!projectDir) {
    return servers;
  }

  const projectConfig = await readMcpConfig("project", projectDir, opts?.projectConfig);
  for (const [name, server] of Object.entries(projectConfig.mcpServers || {})) {
    servers[name] = { server, scope: "project" };
  }

  return servers;
}
