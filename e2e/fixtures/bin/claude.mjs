import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [command, ...rest] = process.argv.slice(2);
const claudeJson = join(process.env.HOME, ".claude.json");

const CONTEXT_SUMMARY = `**Model:** claude-sonnet-4-6
**Tokens:** 12k / 200k (6%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 3.0k | 1.5% |
| System tools | 8.0k | 4.0% |
| Memory files | 1.0k | 0.5% |
| Free space | 188k | 94.0% |
`;

const CONTEXT_ALL = `**Model:** claude-sonnet-4-6
**Tokens:** 12k / 200k (6%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 3.0k | 1.5% |
| System tools | 8.0k | 4.0% |
| Memory files | 1.0k | 0.5% |
| Free space | 188k | 94.0% |

### Memory Files

| Type | Path | Tokens |
|------|------|--------|
| User | ~/.claude/CLAUDE.md | 1.0k |
`;

function readConfig() {
  return JSON.parse(readFileSync(claudeJson, "utf8"));
}

function writeConfig(config) {
  writeFileSync(claudeJson, JSON.stringify(config, null, 2));
}

/** `-s user` writes the top-level map; `local` writes under projects[cwd]. */
function serversFor(config, scope) {
  if (scope === "user") return (config.mcpServers ??= {});
  const project = (config.projects ??= {});
  return ((project[process.cwd()] ??= {}).mcpServers ??= {});
}

function scopeFlag(args) {
  const index = args.indexOf("-s");
  return index === -1 ? "user" : args[index + 1];
}

function listServers() {
  const config = readConfig();
  const lines = ["Checking MCP server health..."];
  for (const [name, server] of Object.entries(config.mcpServers ?? {})) {
    const isRemote = typeof server.url === "string";
    const target = isRemote ? server.url : [server.command, ...(server.args ?? [])].join(" ");
    const status = isRemote ? "✗ Failed to connect" : "✔ Connected";
    lines.push(`${name}: ${target} - ${status}`);
  }
  return lines.join("\n") + "\n";
}

if (command === "--version") {
  console.log("2.0.0-e2e (Claude Code)");
} else if (command === "/context") {
  process.stdout.write(rest[0] === "all" ? CONTEXT_ALL : CONTEXT_SUMMARY);
} else if (command === "mcp" && rest[0] === "list") {
  process.stdout.write(listServers());
} else if (command === "mcp" && rest[0] === "add-json") {
  const config = readConfig();
  serversFor(config, scopeFlag(rest))[rest[1]] = JSON.parse(rest[2]);
  writeConfig(config);
} else if (command === "mcp" && rest[0] === "remove") {
  const config = readConfig();
  delete serversFor(config, scopeFlag(rest))[rest[1]];
  writeConfig(config);
} else {
  console.error(`claude stub: unsupported invocation: ${[command, ...rest].join(" ")}`);
  process.exit(2);
}
