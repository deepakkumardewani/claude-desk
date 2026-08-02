import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const CLI_TIMEOUT_MS = 60_000;

export type HealthStatus = "connected" | "failed" | "unknown";

export interface ServerHealth {
  status: HealthStatus;
  message?: string;
  timestamp: string;
}

export interface McpHealthResult {
  available: boolean;
  status: Record<string, ServerHealth>;
}

/**
 * Map a raw status string from `claude mcp list` to a HealthStatus value.
 * Lines look like: "name: <transport> - ✔ Connected" or "- ! Needs authentication"
 */
function parseStatusToken(raw: string): { status: HealthStatus; message?: string } {
  const lower = raw.toLowerCase();
  // Match "✔ Connected" but not "Disconnected"
  if (/\bconnected\b/.test(lower) && !lower.includes("disconnected"))
    return { status: "connected" };
  if (lower.includes("needs authentication"))
    return { status: "unknown", message: "Needs authentication" };
  return { status: "failed", message: raw.trim() || "Disconnected" };
}

/**
 * Parse the stdout of `claude mcp list` into a health map.
 *
 * Example input:
 *   Checking MCP server health…
 *
 *   chrome-devtools: npx -y chrome-devtools-mcp@latest - ✔ Connected
 *   agentmemory: npx -y @agentmemory/mcp - ✔ Connected
 *   claude.ai Google Drive: https://... - ! Needs authentication
 */
export function parseMcpListOutput(
  stdout: string,
  timestamp: string,
): Record<string, ServerHealth> {
  const result: Record<string, ServerHealth> = {};

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();

    // Skip blank lines and the banner
    if (!trimmed || trimmed.startsWith("Checking MCP server health")) continue;

    // Pattern: "<name>: <transport details> - <status marker> <status text>"
    // The separator between name and transport is ": " but names can contain spaces,
    // so we use the last " - " as the status delimiter.
    const statusSepIdx = trimmed.lastIndexOf(" - ");
    if (statusSepIdx === -1) continue;

    const nameAndTransport = trimmed.slice(0, statusSepIdx);
    const statusRaw = trimmed.slice(statusSepIdx + 3); // skip " - "

    // Name is everything before the first ": "
    const colonIdx = nameAndTransport.indexOf(": ");
    if (colonIdx === -1) continue;

    const name = nameAndTransport.slice(0, colonIdx);
    const { status, message } = parseStatusToken(statusRaw);

    result[name] = { status, ...(message ? { message } : {}), timestamp };
  }

  return result;
}

/**
 * Run `claude mcp list`, parse the output, and return a health map.
 * Returns `{ available: false, status: {} }` if the CLI is not found or times out.
 */
export async function queryMcpHealth(
  runner: (cmd: string, opts: { timeout: number }) => Promise<{ stdout: string }> = execAsync,
): Promise<McpHealthResult> {
  const timestamp = new Date().toISOString();

  try {
    const { stdout } = await runner("claude mcp list", { timeout: CLI_TIMEOUT_MS });
    return { available: true, status: parseMcpListOutput(stdout, timestamp) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    // CLI not installed
    if (code === "ENOENT") {
      return { available: false, status: {} };
    }

    // Timeout or other transient failure — still mark as unavailable
    const killed = (error as { killed?: boolean }).killed;
    if (killed || code === "ETIMEDOUT") {
      return { available: false, status: {} };
    }

    // `claude mcp list` may exit non-zero but still produce useful stdout
    const stdout = (error as { stdout?: string }).stdout ?? "";
    if (stdout) {
      return { available: true, status: parseMcpListOutput(stdout, timestamp) };
    }

    return { available: false, status: {} };
  }
}
