# claude-desk

Browse and edit your Claude Code config (`~/.claude`) in the browser.

```bash
npx claude-desk
# or: bunx claude-desk
```

Opens a local UI for skills, plans, commands, CLAUDE.md, agents, plugins, MCP servers, usage, backups, and settings. Switch user vs project scope in the header.

## Flags

| Flag                | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `--port <n>` / `-p` | Listen port (default `3847`)                         |
| `--keep-alive`      | Keep the server running after the browser tab closes |

Default mode shuts down when the browser tab closes (or on Ctrl+C).

## Requirements

- Node.js `>= 22.12` (or Bun)
- No global Vite+ / build toolchain required at runtime
