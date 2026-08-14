import { z } from "zod";

/**
 * MCP Server transport configuration schemas
 */

// Stdio transport - spawns a process and communicates via stdin/stdout
export const stdioTransportSchema = z.object({
  type: z.literal("stdio"),
  command: z.string().min(1).describe("Path to executable or command"),
  args: z.array(z.string()).default([]).optional().describe("Command arguments"),
  env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
});

export type StdioTransport = z.infer<typeof stdioTransportSchema>;

// HTTP transport - connects to a server via HTTP
export const httpTransportSchema = z.object({
  type: z.literal("http"),
  url: z.string().url().describe("HTTP server URL"),
  headers: z.record(z.string(), z.string()).optional().describe("HTTP headers"),
  timeout: z.number().int().positive().optional().describe("Request timeout in ms"),
});

export type HttpTransport = z.infer<typeof httpTransportSchema>;

// SSE transport - Server-Sent Events connection
export const sseTransportSchema = z.object({
  type: z.literal("sse"),
  url: z.string().url().describe("SSE server URL"),
  headers: z.record(z.string(), z.string()).optional().describe("HTTP headers"),
  timeout: z.number().int().positive().optional().describe("Request timeout in ms"),
});

export type SseTransport = z.infer<typeof sseTransportSchema>;

// Union of all transport types
const transportSchema = z.union([stdioTransportSchema, httpTransportSchema, sseTransportSchema]);

/**
 * MCP Server configuration entry
 */
export const mcpServerSchema = z.object({
  name: z.string().min(1).describe("Unique server identifier"),
  disabled: z.boolean().optional().default(false).describe("Whether the server is disabled"),
  transport: transportSchema,
});

export type McpServer = z.infer<typeof mcpServerSchema>;

/**
 * MCP configuration file (.mcp.json)
 */
export const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerSchema).optional().default({}),
});

export type McpConfig = z.infer<typeof mcpConfigSchema>;

/**
 * Parse MCP configuration safely
 */
export function parseMcpConfig(input: unknown): McpConfig {
  return mcpConfigSchema.parse(input);
}

/**
 * Safe parse that returns validation errors instead of throwing
 */
export function safeParseMcpConfig(input: unknown) {
  return mcpConfigSchema.safeParse(input);
}

/**
 * API Response types
 */

/**
 * Origin of an MCP server entry:
 *   "file"   — discovered in ~/.claude.json or .mcp.json; config is owned by this app (editable).
 *   "plugin" — only present in `claude mcp list` output, not in any managed config file (read-only).
 *
 * Health enum notes (Phase 2 mapping from `claude mcp list`):
 *   "connected"  — server is running and reachable.
 *   "failed"     — server is disconnected or errored.
 *   "unknown"    — status could not be determined, OR "Needs authentication" (folded into unknown
 *                  because Phase 2's parseStatusToken maps that phrase to { status: "unknown" }).
 *                  "needs-auth" is NOT a separate enum value.
 */
export const mcpServerResponseSchema = z.object({
  name: z.string(),
  disabled: z.boolean().optional(),
  transport: transportSchema,
  scope: z.enum(["user", "project", "local"]).describe("Which scope the server is defined in"),
  health: z
    .enum(["connected", "failed", "unknown"])
    .optional()
    .default("unknown")
    .describe("Connection health status"),
  error: z.string().optional().describe("Error message if health is failed"),
  /**
   * Where the server config was sourced from.
   * "file"   = editable via this app; "plugin" = read-only, managed externally.
   */
  origin: z.enum(["file", "plugin"]).optional().default("file").describe("Config origin"),
  /** false when origin is "plugin" — those servers cannot be modified via this app */
  editable: z.boolean().optional().default(true).describe("Whether the server can be edited"),
});

export type McpServerResponse = z.infer<typeof mcpServerResponseSchema>;

export const mcpListResponseSchema = z.object({
  servers: z.array(mcpServerResponseSchema),
});

export type McpListResponse = z.infer<typeof mcpListResponseSchema>;

export const mcpAddRequestSchema = z.object({
  name: z.string().min(1).describe("Unique server identifier"),
  transport: transportSchema,
  scope: z.enum(["user", "project", "local"]).default("user").optional(),
});

export type McpAddRequest = z.infer<typeof mcpAddRequestSchema>;

export const mcpRemoveRequestSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(["user", "project", "local"]).default("user").optional(),
});

export type McpRemoveRequest = z.infer<typeof mcpRemoveRequestSchema>;

export const mcpHealthResponseSchema = z.object({
  status: z.enum(["connected", "failed", "unknown"]),
  message: z.string().optional(),
  timestamp: z.string().describe("ISO 8601 timestamp"),
});

export type McpHealthResponse = z.infer<typeof mcpHealthResponseSchema>;

export const mcpHealthCheckResponseSchema = z.object({
  servers: z.record(z.string(), mcpHealthResponseSchema),
  timestamp: z.string().describe("ISO 8601 timestamp"),
});

export type McpHealthCheckResponse = z.infer<typeof mcpHealthCheckResponseSchema>;
