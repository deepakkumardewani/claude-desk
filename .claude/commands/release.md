---
description: Release claude-desk to npm (check, test, build, pack, publish)
---

Run the **claude-desk** npm release for this monorepo. Do **not** invent a separate release shell script — execute the steps below directly.

`/release` means **ship to npm** from **`apps/cli` only**. You run the rote steps. **Stop for an explicit "yes"** before each irreversible action. "Looks good", silence, or "whatever you think" are not a yes — re-ask with the concrete command.

Irreversible gates:

1. **`npm publish`** from `apps/cli` (an npm version cannot be republished).
2. **Pushing `vX.Y.Z`** (cannot be cleanly un-pushed).

## Preconditions — refuse if any fail

1. **On `main`:** `git rev-parse --abbrev-ref HEAD` is `main`. Never release from a feature branch.
2. **Clean tree:** `git status --porcelain` is empty.
3. **Synced:** `git fetch` then `main` is not behind/ahead of `origin/main`.
4. **Package identity** from `apps/cli/package.json`:
   - `name` is `claude-desk`, not `private`
   - `bin["claude-desk"]` is `dist/bin.mjs`
   - runtime `dependencies` are only: `hono`, `@hono/node-server`, `open`, `citty`
5. **`npm whoami`** works. If not, stop and tell the user to `npm login`.

Do **not** publish the root workspace (`cc-studio-workspace`), `apps/web`, or `packages/schema`.

## Sequence

### 1. Version (semver)

Current version is `apps/cli/package.json`. Ask if not given. Breaking → major, feature → minor, fix → patch. Confirm `vX.Y.Z`.

Bump **only** `apps/cli/package.json`. Root / `web` / `schema` stay private `0.0.0`.

If the tree is no longer clean after the bump, that is expected — do not commit unless the user asks (or this `/release` run already includes ship authorization). Then include `apps/cli/package.json` in that commit.

### 2. Gate (must all pass, from repo root)

> Always run the **root** `bun run build` before publish. `apps/cli` `prepublishOnly` builds the CLI only — it does **not** rebuild the web SPA. Skipping the root build can publish a stale or missing `web/` tree.

`bun run ready` is the one-shot equivalent (`check` + tests + build). Otherwise, in order:

```bash
bunx vp check          # if format fails: bunx vp check --fix, then re-run
bunx vp test
bun run build          # schema → web → CLI; copies SPA into apps/cli/web and LICENSE into apps/cli
cd apps/cli && npm pack --dry-run
```

Pack must include `dist/`, `web/index.html`, `README.md`, `LICENSE`, and bin `claude-desk`. No workspace `schema` in runtime deps.

### 3. 🚪 GATE — `npm publish`

**Stop. Show the command. Get an explicit yes.** Then:

```bash
cd apps/cli && npm publish --access public
```

Never `--force`, `--ignore-scripts`, or `--no-verify`.

### 4. 🚪 GATE — tag

**Stop. Show the commands. Get an explicit yes.** Then:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 5. Verify

- `npm view claude-desk version` is `X.Y.Z`
- Smoke (remind; prefer a clean cache): `npx claude-desk@X.Y.Z --keep-alive` — browser opens to home; Ctrl+C exits

## Output

```text
Published claude-desk@<version>
Tag: v<version>
Smoke: npx claude-desk@<version> --keep-alive
```

Checklist: main+clean+synced · identity · `npm whoami` · check · test · build · pack dry-run · explicit yes ×2 · npm version · tag

## Rules

- Never skip a failing step.
- Never publish root / `apps/web` / `packages/schema`.
- Do not commit or push (except the tag after GATE 2) unless the user explicitly asks.
