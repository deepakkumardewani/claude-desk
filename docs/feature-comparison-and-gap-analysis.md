# Feature Comparison & Gap Analysis

## cc-studio vs claude-code-studio (upstream)

**Date:** 2026-07-14
**Purpose:** Detailed research document to inform future spec writing and implementation planning.

---

## 1. Project Overview

### cc-studio (Ours — npm: `claude-desk`)

A local browser-based GUI for browsing and editing Claude Code configuration files (`~/.claude`). Built as a Bun monorepo with three workspaces: `apps/web` (React SPA), `apps/cli` (Hono API server + CLI binary), `packages/schema` (shared Zod schemas). Uses Vite+ toolchain, Tailwind CSS v4, CodeMirror 6.

### claude-code-studio (Upstream — npm: `cc-studio`, by msiShariful)

A local, no-telemetry GUI for managing Claude Code settings, MCP servers, plugins, hooks, agents, skills, and CLAUDE.md without hand-editing JSON. Built as an npm workspaces monorepo with three packages: `packages/core`, `packages/server` (Fastify), `packages/web` (React SPA). Uses TypeScript, Vitest, Vite.

Both projects serve the same core purpose but have diverged significantly in feature focus.

---

## 2. Features We Have (cc-studio)

### 2.1 Claude Code Config File Browser & Editor

- **File tree sidebar** (`apps/web/src/components/FileTree.tsx`): Collapsible tree with folder/file icons, persistent open/closed state in localStorage, auto-expands to active file, supports nested directories within categories.
- **Category explorer** (`apps/web/src/routes/File.tsx`): Routes like `/skills`, `/plans`, `/commands`, `/agents`, `/plugins` show a category index page explaining the category and directing users to the sidebar to browse.
- **Markdown viewer** (`apps/web/src/components/MarkdownView.tsx`): Uses `react-markdown` + `remark-gfm` with syntax-highlighted code blocks via Shiki. Supports tables, task lists, blockquotes, headings, and checkboxes.
- **Markdown editor** (`apps/web/src/components/MarkdownEditor.tsx`): CodeMirror 6 with markdown language support, GitHub-themed dark/light modes, line numbers, fold gutter, active line highlighting, bracket matching, line wrapping.
- **JSON viewer** (`apps/web/src/routes/File.tsx`): Files ending in `.json` display in a monospace `<pre>` block.
- **Skill frontmatter header** (`apps/web/src/components/SkillHeader.tsx`): Parses YAML frontmatter from skill files and displays name, description, `user-invocable` status, and `argument-hint` as labeled chips.

### 2.2 Settings Management (Schema-Driven)

- **Full settings editor** (`apps/web/src/routes/Settings.tsx`): Renders all ~80+ Claude Code settings fields organized in 9 collapsible groups.
- **Zod validation schema** (`packages/schema/src/index.ts`): Complete Zod schema defining every `settings.json` field with types, enums, records, and nested objects.
- **Field metadata catalog** (`packages/schema/src/metadata.ts`): 80+ settings fields with descriptions, control types (toggle/select/input/json), group assignments, and placeholder examples.
- **Group navigation** (`apps/web/src/components/SettingsForm.tsx`): Sidebar section navigation with click-to-scroll, intersection-observer-based active section tracking, scroll-to-top button, clean/dirty state tracking, save/discard buttons.
- **Settings search**: Full-text search across field labels, keys, and descriptions within the settings form.
- **6 field renderers** (`apps/web/src/components/field-renderers.tsx`): Toggle (switch), Select (dropdown), Input (text), JSON (textarea with auto-resize), plus inline and stacked layout variants.
- **Atomic settings writing** (`apps/cli/src/fs/writeSettings.ts`): Validates via Zod, writes to temp file, renames atomically, creates `.bak` backup.

### 2.3 Context Inspector (Workspace Page)

- **Context summary** (`apps/web/src/routes/Workspace.tsx`): Calls `claude /context all` and displays model name, token usage, context window capacity, and per-category breakdown.
- **Token usage visualization** (`apps/web/src/components/StackedUsageBar.tsx`): Horizontal stacked bar showing token consumption by category.
- **Category breakdown table** (`apps/web/src/components/CategorySummaryTable.tsx`): Tabular view with per-category token counts, percentages, and drill-down items.
- **CLI integration** (`apps/cli/src/routes/context.ts`): Spawns `claude` CLI subprocess, parses markdown table output. Two endpoints: `/api/context` (summary) and `/api/context/all` (full detail).
- **Context caching** (`apps/web/src/lib/contextCache.ts`): In-memory SPA cache so revisiting Workspace skips loading spinners.

### 2.4 Home Dashboard (Search + Browse)

- **Global search** (`apps/web/src/routes/List.tsx`): Full-text search across all config files. Cmd+K or `/` to focus. Category scope filter pills. Result count. Enter-key navigates to first result.
- **Category browse grid**: Color-coded category cards with item counts for quick access.
- **Recently viewed** (`apps/web/src/lib/recent.ts`): localStorage-based recent file history shown on the home page.
- **Current config summary**: At-a-glance stats showing model, effort level, permissions mode, and plugin count.

### 2.5 Plugin Management

- **Plugin field editor** (`apps/web/src/components/PluginsField.tsx`): Structured editor for `enabledPlugins` (plugin-id@marketplace-id format). Grouped by marketplace, toggle on/off per plugin, add new plugins with name+marketplace fields, raw JSON mode fallback.
- **Plugin category index** (`apps/web/src/components/CategoryIndex.tsx`): Lists plugins configured in settings with on/off status, links to edit in settings.
- **Marketplace configuration** (`apps/web/src/components/MarketplacesField.tsx`): Structured editor for `extraKnownMarketplaces` with source type selection (GitHub repo / Git URL), repo/URL/ref fields.

### 2.6 Environment Variable Management

- **Env variable editor** (`apps/web/src/components/EnvField.tsx`): Structured key-value editor for the `env` settings block.
- **Curated env variable catalog** (`apps/web/src/lib/env-catalog.ts`): 40+ documented Claude Code environment variables across 7 categories (Model & reasoning, Auth & routing, Providers, Timeouts & limits, Features & behavior, Telemetry & privacy, Network).
- **Add-variable dialog**: Modal browser/search for adding known env vars from the catalog, grouped by category, with dedup against already-set vars.
- **Smart value controls**: Dropdowns for variables with fixed options or boolean flags; text inputs for freeform values.

### 2.7 Skill Override Management

- **Skill overrides editor** (`apps/web/src/components/SkillOverridesField.tsx`): Structured editor for `skillOverrides` setting. Fetches live skill list from API, shows each skill with visibility dropdown (On / Name only / User invocable only / Off). Off skills shown with strikethrough. Summary counts.

### 2.8 File System Layer (Scoped Access)

- **Scoped file access** (`apps/cli/src/fs/scoped.ts`): Reads/writes files strictly within `~/.claude/` with path-escaping protection. 7 category roots. Recursive directory walking for .md and .json files.
- **All-categories listing**: Parallel fetch of all category file lists.

### 2.9 REST API (Hono Server)

- `GET /api/health` — Health check
- `GET /api/tree` — All categories with file lists
- `GET /api/file?category=&name=` / `POST /api/file?category=&name=` — File CRUD
- `GET /api/settings` / `PUT /api/settings` / `GET /api/settings/schema` — Settings API
- `GET /api/skills` — Skill names with labels and override status
- `GET /api/context` / `GET /api/context/all` — Context inspection via claude CLI
- `GET /api/lifecycle` — SSE endpoint for tab tracking, auto-shutdown

### 2.10 CLI Binary (`claude-desk`)

- Entry point (`apps/cli/src/bin.ts`): `npx claude-desk` with `--port` / `-p` (default 3847) and `--keep-alive` flags. Auto-opens browser via the `open` npm package. Graceful shutdown on SIGINT/SIGTERM.

### 2.11 Theme System

- Dark/light theme with localStorage persistence, system preference detection, live media query listener.
- Theme toggle button in header.

### 2.12 Other Features

- **Unsaved changes dialog**: React Router `useBlocker` + `beforeunload` event listener for navigation with dirty state.
- **Category color coding**: 7 categories with distinct Tailwind color tokens; deterministic color assignment for dynamic context categories.
- **Authentication config via settings**: `forceLoginMethod`, `apiKeyHelper`, AWS credential management, OTel headers, provider routing (Bedrock/Vertex).
- **MCP server config** (settings-based, not a dedicated UI): `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `allowedMcpServers`, `deniedMcpServers`, etc.
- **Git & attribution**: `includeGitInstructions`, `attribution`, `prUrlTemplate`, `respectGitignore`.
- **Security & permissions**: Structured `permissions` field, managed settings, hook management, plugin restrictions, sandbox config.
- **Build toolchain**: Vite+ 0.2.1, Bun 1.3.6, TypeScript ~5.7.3, Tailwind CSS v4, Vitest via Vite+.

---

## 3. Features Upstream Has That We Don't

### 3.1 MCP Server Management UI (High Impact)

Upstream provides a full MCP server management interface. Users can list, add, and remove MCP servers at user/local/project scopes. It includes a searchable catalog of popular/prebuilt MCP servers and shows live connection health per server (connected or failed status). Backs up `.mcp.json` before modification.

**Why we need it:** Managing MCP servers is currently manual JSON editing in our app. Users have to know server names, config formats, and restart to test. A visual UI with health checks would save significant debugging time.

**Key upstream files:** `packages/core/src/mcp.ts`, `packages/web/src/mcpCatalog.ts`, `packages/server/src/routes/mcp.ts`

### 3.2 Scope-Aware Workspaces (High Impact)

Upstream understands config scope resolution: Global (aggregated), User (`~/.claude/`), and Project (project-local `.claude/`). Users can switch between scopes and every screen/view filters to the active scope. Shows effective config (merged result of all settings files) with each value badged by its originating scope.

**Why we need it:** Our file tree mirrors `~/.claude/` but doesn't distinguish between user and project scopes. Users editing project-level config can accidentally modify global settings. Scope awareness is fundamental to correct config management.

**Key upstream files:** `packages/core/src/precedence.ts`, `packages/core/src/managed-files.ts`

### 3.3 Usage Analytics Dashboard (High Impact)

A full local-only analytics subsystem tracking Claude Code usage. Views include: Overview, Models, Projects, Sessions, Prompts, Timeline, Windows. Chart types: BurnGauge, CostBars, Heatmap, ModelSplit, ShareBar, Metric. All data stays local — no telemetry sent externally.

**Why we need it:** Our context inspector shows current session stats but has no historical view. Users can't see cost trends, model usage patterns, or project-level breakdowns over time. This is a power-user feature that would differentiate us.

**Key upstream files:** `packages/web/src/usage/` (7 view files + chart components)

### 3.4 Dashboard with Setup Status (High Impact)

Detects whether the `claude` CLI is installed, flags config file problems and gaps, and provides quick-link actions to fix missing configuration. Per-workspace overview of Claude setup status.

**Why we need it:** Our home page shows config summary but doesn't proactively flag issues. New users don't know what they haven't configured. A status dashboard lowers the onboarding friction.

### 3.5 Automatic Backups (High Impact)

Automatically backs up every file before modification. Includes a backups browser and restore route on the server. Tests cover backup behavior in both core and server packages.

**Why we need it:** Our settings write does create a `.bak` file, but file editing (skills, agents, CLAUDE.md) has no backup mechanism. A systematic backup system with restore UI adds safety for all config edits.

**Key upstream files:** `packages/core/src/backups.ts`, `packages/server/src/routes/backups.ts`

### 3.6 Hooks Management UI (Medium Impact)

Browse and manage `.claude/hooks/` directory. Includes a catalog of available hook types and trigger events. Provides structured editing for hook configurations.

**Why we need it:** Hooks are powerful but opaque — they're just files in a directory. A management UI with a catalog of known hook types and trigger events makes them accessible to users who wouldn't otherwise use them.

**Key upstream files:** `packages/web/src/hooksCatalog.ts`

### 3.7 Plugin Browse & Install (Medium Impact)

Searchable plugin catalog, install/remove plugins directly from configured marketplaces. This is different from our approach (settings-field editor) — it's a browse-and-install flow like an app store.

**Why we need it:** Our plugin editor requires users to know the exact plugin ID and marketplace. A browsable catalog with install/uninstall is more user-friendly and discoverable.

**Key upstream files:** `packages/web/src/pluginCatalog.ts`, `packages/core/src/plugins.ts`

### 3.8 Color Diff Preview (Medium Impact)

Shows a color-coded diff of changes before any write operation. Detects conflicts (file changed since you opened it) and prevents silent overwrites.

**Why we need it:** We have an unsaved-changes guard but no diff preview. Users save changes without seeing exactly what will change, which is error-prone for JSON configs.

### 3.9 Status Dots on Files (Lower Impact)

Visual indicators on every config file in the sidebar tree showing what is configured vs. missing or misconfigured.

**Why we need it:** Quick visual scan of config completeness. Low implementation cost, nice UX polish.

### 3.10 Token-Based Auth (Lower Impact)

Server mints a session token on startup, passes it via URL hash (`/#token=...`), and validates on all API requests. Server binds to `127.0.0.1:<random>`.

**Why we need it:** Our server is unprotected localhost. Token auth adds a small security layer, relevant if other local processes could probe the port.

**Key upstream files:** `packages/server/src/auth.ts`

### 3.11 Effective Config Viewer (Lower Impact)

Merged view of all settings files showing what the effective configuration is after scope merging. Each value is badged with its originating scope. Click a value to jump to its source file for editing.

**Why we need it:** Claude Code merges settings from multiple files with precedence rules. Users can't easily see the final merged result. This helps debug "why is this setting not taking effect?" questions.

**Key upstream files:** `packages/core/src/precedence.ts`, `packages/core/src/settings.ts`

---

## 4. Novel Feature Ideas (Neither Project Has)

### 4.1 CLAUDE.md Assistant (Novel A)

AI-assisted CLAUDE.md writing with:

- Templates by project type (Next.js, Python, Go, Rust, etc.)
- Best-practice suggestions based on project structure analysis
- Auto-detection of project type from `package.json`, `Cargo.toml`, etc.
- Guided prompts: "What should Claude know about your testing setup?"
- Preview of how CLAUDE.md content affects Claude Code behavior

**Why:** CLAUDE.md is the most impactful config file — it shapes all Claude Code interactions. Most users underinvest in it because they don't know what to write.

### 4.2 Config Health Score (Novel B)

Aggregate score showing how well-configured Claude Code is, with actionable recommendations:

- Completeness score: What percentage of useful settings are configured?
- Best practices score: Are you following recommended patterns?
- Security score: Are permissions properly locked down?
- Recommendations ranked by impact

**Why:** Gamifies good configuration and surfaces gaps users wouldn't discover on their own.

### 4.3 One-Click Setup Wizards (Novel C)

Guided step-by-step wizards for common workflows:

- **AWS Bedrock setup**: Region, credentials, model selection
- **GitLab integration**: Personal access token, self-hosted URL
- **Custom API provider**: Base URL, auth header, model mapping
- **GitHub Codespaces**: Remote environment config
- **Team onboarding**: Export config, share with team

**Why:** Many Claude Code features (Bedrock, Vertex, custom providers) require multi-step setup across settings and env vars. Wizards collapse this into a guided flow.

### 4.4 Prompt Library (Novel D)

Save, categorize, and reuse prompt templates:

- Built-in library of useful prompts (code review, refactor, explain, test generation)
- User-created prompts with categories and tags
- Quick-insert into Claude Code sessions
- Variable substitution in prompt templates

**Why:** Users develop prompt patterns they reuse. A library makes these discoverable and shareable.

### 4.5 Config Validation & Linting (Novel H)

Catch misconfigurations before they cause runtime errors:

- Deprecated settings warnings
- Conflicting settings detection (e.g., two models configured for same provider)
- Invalid value detection (wrong format, out-of-range)
- Missing required companion settings (e.g., Bedrock enabled but no region set)
- Schema version compatibility check

**Why:** Claude Code has ~80+ settings with complex interdependencies. Silent misconfiguration is a common frustration.

### 4.6 Keyboard Shortcut Reference (Novel I)

Visual keybindings browser:

- Full keyboard shortcut map for Claude Code
- Custom keybinding editor/viewer
- Search by key combination or action name
- Printable cheat sheet

**Why:** Claude Code has many shortcuts that users discover accidentally. A visual reference improves discoverability.

### 4.7 Diff Viewer for File History (Novel J)

Git-like diff of config file changes over time:

- Leverage `.bak` files or git history for change tracking
- Side-by-side or unified diff view
- Timeline of changes per file
- "Who changed what and when" if using git

**Why:** When config breaks, users want to know what changed. Currently there's no history beyond a single `.bak` file.

### 4.8 Deferred Ideas

These novel ideas were considered but deferred:

| #   | Idea                       | Reason Deferred                                                              |
| --- | -------------------------- | ---------------------------------------------------------------------------- |
| E   | Multi-project dashboard    | Large scope; requires scanning filesystem for all projects using Claude Code |
| F   | Export/import profiles     | Useful but lower priority; can be done manually via file copy                |
| G   | Session replay/log browser | Requires parsing Claude Code session data; format is unstable                |

---

## 5. Feature Matrix Summary

| #   | Feature                             | Category  | We Have             | Upstream Has | Priority |
| --- | ----------------------------------- | --------- | ------------------- | ------------ | -------- |
| 1   | MCP server management UI            | Upstream  | No                  | Yes          | 1        |
| 2   | Usage analytics dashboard           | Upstream  | No                  | Yes          | 2        |
| 3   | Automatic backups                   | Upstream  | Partial (.bak only) | Yes          | 3        |
| 4   | Scope-aware workspaces              | Upstream  | No                  | Yes          | 4        |
| 5   | Dashboard with setup status         | Upstream  | No                  | Yes          | 5        |
| 6   | Config validation & linting         | Novel (H) | No                  | No           | 6        |
| 7   | Color diff preview                  | Upstream  | No                  | Yes          | 7        |
| 8   | CLAUDE.md assistant                 | Novel (A) | No                  | No           | 8        |
| 9   | One-click setup wizards             | Novel (C) | No                  | No           | 9        |
| 10  | Config health score                 | Novel (B) | No                  | No           | 10       |
| 11  | Prompt library                      | Novel (D) | No                  | No           | 11       |
| 12  | Hooks management UI                 | Upstream  | No                  | Yes          | 12       |
| 13  | Plugin browse & install             | Upstream  | Partial             | Yes          | 13       |
| 14  | Keyboard shortcut reference         | Novel (I) | No                  | No           | 14       |
| 15  | Diff viewer for file history        | Novel (J) | No                  | No           | 15       |
| 16  | Status dots on files                | Upstream  | No                  | Yes          | 16       |
| 17  | Effective config viewer             | Upstream  | No                  | Yes          | 17       |
| 18  | Token-based auth                    | Upstream  | No                  | Yes          | 18       |
| —   | File tree & editor                  | Both      | Yes                 | Yes          | —        |
| —   | Settings editor                     | Both      | Yes                 | Yes          | —        |
| —   | Dark/light theme                    | Both      | Yes                 | Yes          | —        |
| —   | CLI binary + auto-open browser      | Both      | Yes                 | Yes          | —        |
| —   | Context inspector                   | Ours only | Yes                 | No           | —        |
| —   | Env var catalog with smart controls | Ours only | Yes                 | No           | —        |
| —   | Skill overrides editor              | Ours only | Yes                 | No           | —        |
| —   | Global search                       | Ours only | Yes                 | No           | —        |
| —   | SSE lifecycle auto-shutdown         | Ours only | Yes                 | No           | —        |
| —   | Zod schema-driven settings          | Ours only | Yes                 | No           | —        |
| —   | Skill frontmatter parser            | Ours only | Yes                 | No           | —        |
| —   | Recently viewed files               | Ours only | Yes                 | No           | —        |
| —   | Unsaved changes guard               | Ours only | Yes                 | No           | —        |

---

## 6. Architecture Context

### Our Current Architecture

```
cc-studio/
├── apps/
│   ├── web/          # React SPA (Vite, Tailwind v4, CodeMirror 6)
│   │   └── src/
│   │       ├── components/   # Reusable UI components
│   │       ├── routes/       # Page-level route components
│   │       └── lib/          # Utilities, hooks, contexts
│   └── cli/          # Hono API server + CLI binary
│       └── src/
│           ├── routes/       # API route handlers
│           └── fs/           # File system operations
└── packages/
    └── schema/       # Shared Zod schemas + metadata
```

### Key Existing Components to Reuse

- `FileTree` — Sidebar with collapsible folders, category colors, localStorage state
- `MarkdownView` / `MarkdownEditor` — CodeMirror-based editing
- `SettingsForm` — Group-based form with intersection observer navigation
- `CategoryIndex` — Category listing with descriptions and item counts
- `field-renderers.tsx` — 6 field type renderers (toggle, select, input, json, inline, stacked)
- `theme.tsx` — Theme context with dark/light/system
- `categories.ts` — Category metadata and color definitions
- `contextCache.ts` — In-memory SPA cache pattern

### New Dependencies Likely Needed

- **Chart library**: `recharts` or lightweight custom SVG for analytics
- **Diff library**: `diff` npm package for text diffing in diff preview
- **YAML parsing** (already have via skill frontmatter): `yaml` package

### Implementation Pattern

Each feature typically adds:

1. A new route component in `apps/web/src/routes/`
2. API endpoint(s) in `apps/cli/src/routes/`
3. Optionally, core logic in `packages/schema/src/`
4. Route registration in the router and server

---

## 7. Next Steps

1. Review this document and confirm priority order
2. Create detailed specs for Phase 1 features using spec-driven-development
3. Implement incrementally, one phase at a time
4. After each phase: verify with `vp check`, `vp test`, and manual browser testing
