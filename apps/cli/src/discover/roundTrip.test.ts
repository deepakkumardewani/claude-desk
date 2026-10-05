import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { DiscoveredItem, ItemKind } from "schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { applyPlan } from "./apply.js";
import { detectItems } from "./detect.js";
import { listEntries, uninstall } from "./manifest.js";
import {
  buildPlan,
  collectMerges,
  collectWrites,
  readDiskState,
  readMergeState,
  type FetchedItem,
} from "./plan.js";

// Spec §4.4: uninstalling must restore the config tree byte for byte. Everything runs against temp
// dirs, and the `claude` CLI is a stub that always reports ENOENT, so the real ~/.claude is never touched.

const USER = { scope: "user" } as const;
type InstallTarget = Parameters<typeof collectWrites>[1];
const ENOENT = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
const METADATA = new Set(["claude-desk", ".claude-desk-backups"]);

type Fixture = {
  tree: Array<{ path: string; sha: string; size?: number; type: string }>;
  files: Record<string, string>;
};
const load = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

function fetchedFrom(fixtureName: string, pick: (item: DiscoveredItem) => boolean): FetchedItem[] {
  const fixture = load(fixtureName);
  const detected = detectItems(fixture.tree as never, (path) => fixture.files[path]);
  return detected.filter(pick).map((item) => ({
    item,
    source: { owner: "acme", repo: "kit" },
    // Recorded fixtures only keep config files; bundled scripts get stand-in bytes.
    files: new Map(item.files.map((f) => [f.path, fixture.files[f.path] ?? "#!/bin/sh\nexit 0\n"])),
  }));
}

const inline = (item: DiscoveredItem): FetchedItem => ({
  item,
  source: { owner: "acme", repo: "kit" },
  files: new Map(),
});

type Case = { kind: ItemKind; items: () => FetchedItem[] };

const CASES: Case[] = [
  {
    kind: "skill",
    items: () => fetchedFrom("tree-skills-agents-commands.json", (i) => i.path === "skills/pdf"),
  },
  {
    kind: "agent",
    items: () =>
      fetchedFrom("tree-skills-agents-commands.json", (i) => i.kind === "agent").slice(0, 1),
  },
  {
    kind: "command",
    items: () =>
      fetchedFrom("tree-skills-agents-commands.json", (i) => i.kind === "command").slice(0, 1),
  },
  {
    kind: "hook",
    items: () =>
      fetchedFrom(
        "tree-hooks-mcp-settings.json",
        (i) => i.kind === "hook" && i.name === "PreToolUse (Bash)",
      ),
  },
  {
    kind: "setting",
    items: () => [
      inline({
        id: "setting:.claude/settings.json#permissions",
        kind: "setting",
        name: "permissions",
        path: ".claude/settings.json#permissions",
        files: [],
        payload: { key: "permissions", value: { allow: ["Read", "Bash(ls)"] } },
      }),
      inline({
        id: "setting:.claude/settings.json#model",
        kind: "setting",
        name: "model",
        path: ".claude/settings.json#model",
        files: [],
        payload: { key: "model", value: "sonnet" },
      }),
    ],
  },
  {
    kind: "mcp",
    items: () =>
      fetchedFrom(
        "tree-hooks-mcp-settings.json",
        (i) => i.kind === "mcp" && i.path.startsWith(".mcp.json"),
      ),
  },
  {
    kind: "plugin",
    items: () =>
      fetchedFrom("tree-plugin-marketplace.json", (i) => i.kind === "plugin" && i.name === "alpha"),
  },
  {
    kind: "convertible",
    items: () => fetchedFrom("tree-convertible.json", (i) => i.kind === "convertible").slice(0, 1),
  },
];

/** Every file under each dir as `dir-label:relative path -> bytes`, minus claude-desk's own metadata. */
async function snapshot(dirs: Record<string, string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (label: string, base: string, dir: string): Promise<void> => {
    const names = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of names) {
      if (METADATA.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out[`${label}:${relative(base, full)}/`] = "<dir>";
        await walk(label, base, full);
      } else out[`${label}:${relative(base, full)}`] = await readFile(full, "utf8");
    }
  };
  for (const [label, dir] of Object.entries(dirs)) await walk(label, dir, dir);
  return out;
}

let root = "";
let configDir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "claude-rt-root-"));
  configDir = await mkdtemp(join(tmpdir(), "claude-rt-config-"));
  vi.stubEnv("CLAUDE_ROOT", root);
  vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  await rm(configDir, { recursive: true, force: true });
});

async function install(items: FetchedItem[], target: InstallTarget = USER) {
  const writes = collectWrites(items, target);
  const merges = collectMerges(items, target);
  const plan = buildPlan(
    items,
    target,
    await readDiskState(writes),
    await readMergeState(target, merges),
  );
  const mcpRunner = vi.fn().mockRejectedValue(ENOENT);
  const out = await applyPlan({
    plan,
    writes,
    merges,
    mcpRunner,
    record: { items, source: { kind: "github", commit: "c1" } },
  });
  return { out, mcpRunner };
}

/** Pre-existing user config the install has to merge into and later restore. */
async function seedConfig(kind: ItemKind): Promise<void> {
  await writeFile(join(root, "settings.json"), `${JSON.stringify({ model: "opus" }, null, 2)}\n`);
  await mkdir(join(root, "skills/mine"), { recursive: true });
  await writeFile(join(root, "skills/mine/SKILL.md"), "mine");
  if (kind === "mcp") {
    await writeFile(
      join(configDir, ".claude.json"),
      JSON.stringify({ mcpServers: { existing: { command: "x" } } }, null, 2),
    );
  }
}

describe("install then uninstall restores the tree byte for byte", () => {
  for (const { kind, items } of CASES) {
    for (const seeded of [true, false]) {
      it(`${kind} (${seeded ? "existing config" : "empty config"})`, async () => {
        if (seeded) await seedConfig(kind);
        const dirs = { root, config: configDir };
        const before = await snapshot(dirs);

        const fetched = items();
        expect(fetched.length).toBeGreaterThan(0);
        expect(fetched.every((f) => f.item.kind === kind)).toBe(true);
        const { out, mcpRunner } = await install(fetched);
        expect(out.results.map((r) => r.error)).toEqual(fetched.map(() => undefined));
        // The stub is only ever asked to run; nothing escapes to a real `claude`.
        expect(mcpRunner.mock.calls.length).toBe(kind === "mcp" ? fetched.length : 0);

        const entries = await listEntries();
        expect(entries).toHaveLength(fetched.length);
        if (kind !== "plugin") expect(await snapshot(dirs)).not.toEqual(before);

        for (const entry of entries) await uninstall(entry.id, { mcpRunner });

        expect(await snapshot(dirs)).toEqual(before);
        expect(await listEntries()).toEqual([]);
      });
    }
  }

  it("never leaves the temp roots", async () => {
    await stat(root);
    expect(root.startsWith(tmpdir())).toBe(true);
  });
});

describe("project .mcp.json in the real Claude Code shape", () => {
  it("plans, applies and uninstalls, restoring the file byte for byte", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "claude-rt-project-"));
    try {
      const target = { scope: "project", projectDir } as const;
      const mcpFile = join(projectDir, ".mcp.json");
      const original = JSON.stringify(
        {
          mcpServers: {
            existing: { type: "stdio", command: "npx", args: ["-y", "x"], env: { K: "v" } },
            remote: { type: "http", url: "https://example.com/mcp", headers: { A: "b" } },
          },
        },
        null,
        2,
      );
      await writeFile(mcpFile, original);

      const fetched = fetchedFrom(
        "tree-hooks-mcp-settings.json",
        (i) => i.kind === "mcp" && i.path.startsWith(".mcp.json"),
      );
      expect(fetched.length).toBeGreaterThan(0);
      const { out, mcpRunner } = await install(fetched, target);
      expect(out.results.map((r) => r.error)).toEqual(fetched.map(() => undefined));
      expect(await readFile(mcpFile, "utf8")).not.toEqual(original);

      for (const entry of await listEntries()) await uninstall(entry.id, { mcpRunner });

      expect(await readFile(mcpFile, "utf8")).toEqual(original);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });
});
