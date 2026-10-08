<div align="center">

<img src="./assets/logo.png" width="96" alt="Claude Desk logo" />

# Claude Desk

Browse and edit your [Claude Code](https://docs.claude.com/en/docs/claude-code) config (`~/.claude`) in the browser — skills, plans, commands, agents, plugins, MCP, usage, backups, `CLAUDE.md`, and settings — without hand-editing JSON in the terminal. Discover new skills, agents, hooks, and MCP servers from skills.sh and GitHub and install them with a reviewable plan.

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Hono](https://img.shields.io/badge/hono-E36002?style=for-the-badge&logo=hono&logoColor=white)
![Vitest](https://img.shields.io/badge/-Vitest-252529?style=for-the-badge&logo=vitest&logoColor=FCC72B)

![NPM](https://img.shields.io/badge/NPM-%23CB3837.svg?style=for-the-badge&logo=npm&logoColor=white)
[![CI](https://img.shields.io/github/actions/workflow/status/deepakkumardewani/claude-desk/ci.yml?branch=main&style=for-the-badge&label=build)](https://github.com/deepakkumardewani/claude-desk/actions/workflows/ci.yml)
[![GitHub license](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](./LICENSE)

```bash
npx claude-desk
```

One command starts a localhost server and opens the UI. Close the tab to shut down (or pass `--keep-alive`).

[Why](#why) · [Features](#features) · [What's inside](#whats-inside) · [Discover](#discover) · [Quick start](#quick-start) · [Usage](#usage) · [Development](#development) · [Contributing](#contributing) · [How it works](#how-it-works) · [Privacy](#privacy--security)

</div>

---

## Why

Claude Code config lives as files under `~/.claude` — skills, plans, commands, agents, plugins, `CLAUDE.md`, and `settings.json`. Editing that stack in the terminal means bouncing between folders, raw JSON, and markdown with no single place to see what you have.

Claude Desk gives you a local browser UI for the same config: search it, read it with proper rendering, edit it safely, and inspect how context stacks up — without accounts, cloud sync, or leaving localhost.

## Features

- **User / project scope** — switch between `~/.claude` and a project’s `.claude` from the header
- **Workspace browser** — navigate skills, plans, commands, agents, plugins, `CLAUDE.md`, and settings from a single local UI
- **MCP servers** — catalog of installed servers plus custom stdio/HTTP servers and env vars, without hand-writing JSON
- **Usage** — local Claude Code transcripts with estimated spend; tabs Overview, Timeline, Models, Projects, Sessions, Windows, and Prompts
- **Discover** — search [skills.sh](https://skills.sh) or scan any public GitHub repo for skills, agents, commands, hooks, MCP servers, settings keys, plugins, and convertible Cursor/Copilot rules; preview them rendered, then install to user or project scope
- **Trust review and install plans** — deterministic static checks on what you are about to install (danger findings block Apply until acknowledged), plus a file / settings / MCP / marketplace plan with conflict choices before anything is written
- **Installed tab** — installs are tracked with source and commit; check for updates, update, and uninstall with local-edit protection
- **Backups** — list and restore config file backups
- **Readable markdown** — GFM rendering with syntax-highlighted code blocks (Shiki) for skills, plans, commands, and agents
- **Inline editing** — edit markdown files and save back to disk; unsaved-change protection when leaving a dirty page
- **Schema-driven settings** — edit `settings.json` through a typed form (dropdowns, toggles, env vars, plugins, marketplaces) instead of raw JSON
- **Context inspector** — see how context / usage stacks up across your workspace
- **Search** — filter your workspace quickly from the home view
- **Deep links** — open a file via scoped URL (`/user/skills/:name`, `/project/:projectId/...`)
- **Theme toggle** — light / dark UI
- **Safe by default** — API only reaches curated paths under `~/.claude` and the active project’s `.claude` (no arbitrary filesystem access); settings writes are still Zod-validated before save

## What's inside

**Home** — search user or project config, jump into categories, and reopen recently viewed files. Scope switcher is in the header.

![Home](./docs/images/home-v2.png)

**Settings** — schema-driven form for `settings.json` with searchable grouped sections.

![Settings](./docs/images/settings-v2.png)

**Workspace** — context inspector with per-category token breakdown.

![Workspace](./docs/images/workspace-v2.png)

**Skills** — file-tree sidebar plus markdown preview/editor for skills, plans, commands, and agents.

![Skills](./docs/images/skills-v2.png)

**Usage** — analytics from local transcripts: overview, timeline, models, projects, sessions, spend windows, and prompts.

![Usage](./docs/images/usage-v2.png)

**MCP servers** — installed servers for the active scope, plus a catalog to add stdio or HTTP servers.

![MCP](./docs/images/mcp-v2.png)

## Discover

Discover is the **Discover** item in the top nav. It has three tabs: **skills.sh**, **GitHub repo**, and **Installed**. Everything goes through one install pipeline: pick items, choose a target, review the changes and trust findings, then apply.

**skills.sh** — search the skills.sh directory (results show source repo and install count); open a skill to read its `SKILL.md` rendered before installing.

![Discover: skills.sh search](./docs/images/discover-skillssh-v2.png)

**GitHub repo** — paste `owner/repo` or a GitHub URL (including `/tree/<ref>/<subpath>`). Claude Desk scans the tree and groups what it finds into kind tabs: Skills, Agents, Commands, Hooks, MCP, Settings, Plugins, and Convertible (Cursor rules and Copilot instructions, prompts, chat modes, and agents, converted to skills, commands, or agents with a preview). Filter by name, select items, and install.

![Discover: scanning a GitHub repo](./docs/images/discover-repo-v2.png)

**Preview** — click an item to open a drawer with rendered markdown; hooks show the exact command and bundled scripts, and convertible items offer an original vs converted view.

![Discover: item preview drawer](./docs/images/discover-preview-v2.png)

**Install and trust review** — the install dialog walks through Target (user or a project), Changes (files marked new / overwrite / conflict / identical, settings and MCP changes, marketplace additions), Trust review, and Result. Findings cover things like pipe-to-shell, hidden Unicode, broad permissions, and bundled scripts; if any finding is `danger`, Apply stays disabled until you tick "I've reviewed these findings".

![Discover: trust review with Apply gated](./docs/images/discover-trust-v2.png)

**Installed** — every install is recorded with its source and commit. **Check for updates** compares against the repo, **Update** re-plans and applies, and **Uninstall** removes the files and reverts merged settings and MCP entries. Files you edited after installing are flagged "Modified locally" and need an explicit "Delete anyway".

![Discover: Installed tab](./docs/images/discover-installed-v2.png)

Plugins install natively: Claude Desk adds the marketplace to `extraKnownMarketplaces` and enables the plugin in `enabledPlugins`; Claude Code fetches the plugin itself. MCP servers are registered by running `claude mcp add-json`, so the `claude` CLI must be on your `PATH` for MCP installs. Claude Desk never executes scripts or code from a scanned repo; installed hooks and MCP servers only run later, under Claude Code.

## Quick start

**Requirements:** Node.js `>= 22.12` (or [Bun](https://bun.sh)). The Claude Code CLI is optional for browsing config.

```bash
npx claude-desk
# or
bunx claude-desk
```

The app binds to localhost, opens your browser, and serves the prebuilt UI. No account, no cloud, no telemetry. The only outbound traffic is Discover's requests to GitHub and skills.sh, made when you use it (see [Privacy](#privacy--security)).

> [!TIP]
> Use `--keep-alive` if you want the server to stay up after closing the browser tab (handy while iterating on skills or settings).

## Usage

```
claude-desk [options]

Options:
  -p, --port <n>    Listen port (default: random)
  --keep-alive      Keep the server running after the browser tab closes
```

The listen URL includes `#token=...` for local API auth.

Examples:

```bash
npx claude-desk --port 4000
npx claude-desk --keep-alive
```

### What you can open

| Area        | Where it lives                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Skills      | `skills/`                                                                                         |
| Plans       | `plans/`                                                                                          |
| Commands    | `commands/`                                                                                       |
| Agents      | `agents/`                                                                                         |
| Plugins     | `plugins/` (and related settings fields)                                                          |
| MCP servers | Claude MCP config for the active user/project scope                                               |
| CLAUDE.md   | `CLAUDE.md`                                                                                       |
| Settings    | `settings.json`                                                                                   |
| Workspace   | Context inspector (global, not scope-switched)                                                    |
| Usage       | Local Claude Code transcripts (global, not scope-switched)                                        |
| Backups     | Config file backups (global)                                                                      |
| Discover    | skills.sh and GitHub (network); install history in `~/.claude/claude-desk/installs.json` (global) |

## Development

This repo is a Bun workspace monorepo:

| Package                    | Role                       |
| -------------------------- | -------------------------- |
| `apps/web`                 | React SPA (Vite+)          |
| `apps/cli` (`claude-desk`) | Hono API + published `bin` |
| `packages/schema`          | Shared Zod settings schema |

```bash
bun install
bun run dev          # web + API together
bun run build        # schema → web → CLI pack (+ SPA into apps/cli/web)
bunx vp test
bunx vp check
```

Local production CLI after a build:

```bash
bunx claude-desk --keep-alive
```

## Contributing

Contributions are welcome. Keep changes focused and verify locally before opening a PR.

1. **Fork and clone** the repo, then create a branch for your change.
2. **Install** with `bun install` (Bun `1.3.6` — see `packageManager` in `package.json`).
3. **Develop** with `bun run dev` (web + API). Use `bunx claude-desk --keep-alive` after a build to exercise the packaged CLI.
4. **Before you push**, run the same checks CI runs (`bun run ready`, or):

   ```bash
   bun run check   # format, lint, typecheck
   bun run test
   bun run build   # schema → web → CLI
   ```

5. **Open a PR** against `main` with a short description of what changed and why.

Please keep PRs scoped (one concern per PR when practical), follow existing patterns in `apps/web`, `apps/cli`, and `packages/schema`, and avoid committing secrets or local `~/.claude` config.

## How it works

```
┌────────────┐   localhost + #token=…   ┌──────────────────────────┐
│  Browser   │ ◀──────────────────────▶ │  claude-desk (Hono)      │
│  React SPA │                          │  127.0.0.1:<port>        │
└────────────┘                          └────────────┬─────────────┘
                                                     │ scoped read/write
                              ~/.claude  and  <project>/.claude
```

`npx claude-desk` starts the server, opens the URL, and serves the prebuilt SPA from the package. The localhost SPA talks to claude-desk (Hono) on 127.0.0.1; the URL hash carries a local token. The server reads and writes scoped Claude config under `~/.claude` and the selected project’s `.claude`. Discover requests to GitHub and skills.sh are made by this server, not the browser.

## Privacy & security

- **Local server** — binds to localhost; nothing is exposed to your LAN or the internet by default
- **Local bearer token** — API auth uses a token in the URL hash (`#token=...`), not a cloud account
- **No telemetry / no accounts** — nothing is sent about you or your usage; the only outbound requests are Discover's, to `api.github.com`, `raw.githubusercontent.com`, and `skills.sh`, and only when you use Discover
- **GitHub token stays server-side** — for rate limits, Discover uses `GITHUB_TOKEN` / `GH_TOKEN` if set, otherwise tries `gh auth token`; the token is never sent to the browser. Without one it uses unauthenticated requests
- **Installs write files, deliberately** — Discover writes only after you press Apply, into the chosen scope (`~/.claude` or a project's `.claude`, and MCP servers via `claude mcp add-json`) and records the install in `~/.claude/claude-desk/installs.json`; overwritten files are backed up and uninstall refuses to delete locally modified files unless forced
- **Review before you trust** — installed skills, hooks, and MCP servers run with your Claude Code permissions. The trust review is static pattern matching, not a guarantee; read what you install
- **Scoped file access** — only curated paths under `~/.claude` and the active project’s `.claude` are readable/writable through the API (MCP installs go through the `claude` CLI)
- **Validated settings writes** — `settings.json` updates go through the shared Zod schema before disk write
