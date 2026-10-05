import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiscoveredItem, ManifestEntry } from "schema";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  composeDraft,
  computeStatus,
  findExisting,
  listEntries,
  manifestPath,
  readDiskHashes,
  recordEntry,
  targetKey,
  uninstall,
  type EntryDraft,
  type InstallOutcome,
} from "./manifest.js";
import { applySettingsOp, revertSettingsEntries, toPointer } from "./merge.js";
import { sha256 } from "./plan.js";

let root = "";
let previousRoot: string | undefined;

beforeEach(async () => {
  previousRoot = process.env.CLAUDE_ROOT;
  root = await mkdtemp(join(tmpdir(), "claude-manifest-"));
  process.env.CLAUDE_ROOT = root;
});

afterEach(async () => {
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
});

const USER = { scope: "user" } as const;

function entry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    id: "e1",
    source: { kind: "github", owner: "o", repo: "r", sha: "c1", path: "skills/pdf" },
    itemKind: "skill",
    itemName: "pdf",
    target: USER,
    installedAt: "2026-01-01T00:00:00.000Z",
    files: [{ path: "/a/SKILL.md", sha256: sha256("body") }],
    settingsEntries: [],
    mcpServers: [],
    sourceBlobShas: { "skills/pdf/SKILL.md": "blob1" },
    ...overrides,
  };
}

const disk = (content: Record<string, string>) =>
  new Map(Object.entries(content).map(([path, text]) => [path, sha256(text)]));

describe("computeStatus", () => {
  it("a fresh install computes up-to-date", () => {
    expect(computeStatus(entry(), disk({ "/a/SKILL.md": "body" }))).toBe("up-to-date");
  });

  it("a locally edited file computes modified-locally", () => {
    expect(computeStatus(entry(), disk({ "/a/SKILL.md": "edited" }))).toBe("modified-locally");
  });

  it("a deleted file computes missing-on-disk, outranking modifications", () => {
    const two = entry({
      files: [
        { path: "/a/SKILL.md", sha256: sha256("body") },
        { path: "/a/x.md", sha256: sha256("x") },
      ],
    });
    expect(computeStatus(two, disk({ "/a/SKILL.md": "edited" }))).toBe("missing-on-disk");
  });

  it("a remote whose blob SHAs differ computes update-available", () => {
    const remote = { available: true, blobShas: { "skills/pdf/SKILL.md": "blob2" } } as const;
    expect(computeStatus(entry(), disk({ "/a/SKILL.md": "body" }), remote)).toBe(
      "update-available",
    );
  });

  it("matching remote blob SHAs stay up-to-date", () => {
    const remote = { available: true, blobShas: { "skills/pdf/SKILL.md": "blob1" } } as const;
    expect(computeStatus(entry(), disk({ "/a/SKILL.md": "body" }), remote)).toBe("up-to-date");
  });

  it("a failed remote lookup computes source-unavailable", () => {
    expect(computeStatus(entry(), disk({ "/a/SKILL.md": "body" }), { available: false })).toBe(
      "source-unavailable",
    );
  });

  it("a repo that no longer has any recorded path computes source-unavailable", () => {
    const remote = { available: true, blobShas: { "other/file": "z" } } as const;
    expect(computeStatus(entry(), disk({ "/a/SKILL.md": "body" }), remote)).toBe(
      "source-unavailable",
    );
  });

  it("a file dropped upstream while others remain computes update-available", () => {
    const two = entry({ sourceBlobShas: { "a.md": "1", "b.md": "2" }, files: [] });
    const remote = { available: true, blobShas: { "a.md": "1" } } as const;
    expect(computeStatus(two, new Map(), remote)).toBe("update-available");
  });

  it("an entry with nothing recorded to compare is up-to-date", () => {
    const bare = entry({ sourceBlobShas: {}, files: [] });
    expect(computeStatus(bare, new Map(), { available: true, blobShas: {} })).toBe("up-to-date");
  });

  it("local problems outrank a remote update", () => {
    const remote = { available: true, blobShas: { "skills/pdf/SKILL.md": "blob2" } } as const;
    expect(computeStatus(entry(), disk({ "/a/SKILL.md": "edited" }), remote)).toBe(
      "modified-locally",
    );
  });
});

describe("computeStatus with settings entries", () => {
  const hook = { hooks: [{ type: "command", command: "echo hi" }] };
  const withHook = entry({
    files: [],
    settingsEntries: [{ pointer: "/hooks/PreToolUse", value: [hook], root: "/hooks" }],
  });
  const settingsWith = (...hooks: unknown[]) => ({ hooks: { PreToolUse: hooks } });

  it("stays up-to-date while the recorded entries are intact", () => {
    expect(computeStatus(withHook, new Map(), undefined, settingsWith(hook))).toBe("up-to-date");
  });

  it("tolerates elements other installs or the user added next to ours", () => {
    expect(computeStatus(withHook, new Map(), undefined, settingsWith({ other: 1 }, hook))).toBe(
      "up-to-date",
    );
  });

  it("an edited hook command computes modified-locally", () => {
    const edited = { hooks: [{ type: "command", command: "echo EDITED" }] };
    expect(computeStatus(withHook, new Map(), undefined, settingsWith(edited))).toBe(
      "modified-locally",
    );
  });

  it("a removed entry computes modified-locally", () => {
    expect(computeStatus(withHook, new Map(), undefined, {})).toBe("modified-locally");
  });

  it("detects an edited scalar and ignores settings when none are supplied", () => {
    const model = entry({ files: [], settingsEntries: [{ pointer: "/model", value: "sonnet" }] });
    expect(computeStatus(model, new Map(), undefined, { model: "opus" })).toBe("modified-locally");
    expect(computeStatus(model, new Map())).toBe("up-to-date");
  });

  it("local file problems still outrank remote ones when settings are intact", () => {
    const remote = { available: true, blobShas: { "skills/pdf/SKILL.md": "blob2" } } as const;
    expect(computeStatus(withHook, new Map(), remote, settingsWith(hook))).toBe("update-available");
  });
});

describe("manifest storage", () => {
  const draft = (extra: Partial<EntryDraft> = {}): EntryDraft => {
    const { id: _id, installedAt: _at, ...rest } = entry();
    return { ...rest, ...extra };
  };

  it("writes under ~/.claude/claude-desk/installs.json keyed by scope and projectDir", async () => {
    await recordEntry(draft());
    await recordEntry(draft({ target: { scope: "project", projectDir: "/work/app" } }));
    const raw = JSON.parse(await readFile(manifestPath(), "utf8"));
    expect(manifestPath()).toBe(join(root, "claude-desk", "installs.json"));
    expect(Object.keys(raw.targets).sort()).toEqual(["project:/work/app", "user"]);
  });

  it("returns an empty list when nothing was ever installed", async () => {
    expect(await listEntries()).toEqual([]);
  });

  it("replaces by id keeping the id, and appends otherwise", async () => {
    const first = await recordEntry(draft());
    const replaced = await recordEntry(draft({ itemName: "renamed" }), first.id);
    expect(replaced.id).toBe(first.id);
    await recordEntry(draft({ source: { ...draft().source, path: "skills/other" } }));
    const entries = await listEntries();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === first.id)?.itemName).toBe("renamed");
  });

  it("does not lose entries recorded concurrently", async () => {
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        recordEntry(draft({ source: { ...draft().source, path: `skills/s${n}` } })),
      ),
    );
    expect(await listEntries()).toHaveLength(4);
  });

  it("refuses a corrupt manifest instead of silently resetting it", async () => {
    await mkdir(join(root, "claude-desk"), { recursive: true });
    await writeFile(manifestPath(), "{not json");
    await expect(listEntries()).rejects.toThrow(/corrupt/);
  });

  it("findExisting matches the same item, source and scope only", () => {
    const entries = [entry()];
    const same = { source: entry().source, itemKind: "skill", target: USER } as const;
    expect(findExisting(entries, same)).toBe(entries[0]);
    expect(findExisting(entries, { ...same, target: { scope: "project", projectDir: "/p" } })).toBe(
      undefined,
    );
    expect(findExisting(entries, { ...same, itemKind: "agent" })).toBe(undefined);
  });

  it("targetKey normalizes project directories", () => {
    expect(targetKey({ scope: "project", projectDir: "/a/b/../c" })).toBe("project:/a/c");
  });

  it("readDiskHashes omits files that do not exist", async () => {
    const path = join(root, "f.txt");
    await writeFile(path, "hi");
    const hashes = await readDiskHashes([path, join(root, "nope")]);
    expect([...hashes.keys()]).toEqual([path]);
    expect(hashes.get(path)).toBe(sha256("hi"));
  });
});

describe("composeDraft", () => {
  const item: DiscoveredItem = {
    id: "skill:skills/pdf",
    kind: "skill",
    name: "pdf",
    path: "skills/pdf",
    files: [{ path: "skills/pdf/SKILL.md", size: 1, blobSha: "blob2" }],
  };
  const outcome = (extra: Partial<InstallOutcome> = {}): InstallOutcome => ({
    item,
    source: entry().source,
    target: USER,
    written: [],
    unchanged: [],
    removed: [],
    restorePoints: {},
    settingsEntries: [],
    mcpServers: [],
    ...extra,
  });

  it("records exactly the files written, with their hashes and the item's blob SHAs", () => {
    const draft = composeDraft(outcome({ written: [{ path: "/a/SKILL.md", sha256: "h1" }] }));
    expect(draft.files).toEqual([{ path: "/a/SKILL.md", sha256: "h1" }]);
    expect(draft.sourceBlobShas).toEqual({ "skills/pdf/SKILL.md": "blob2" });
    expect(draft.backups).toBeUndefined();
  });

  it("does not claim an identical pre-existing file the install never wrote", () => {
    const draft = composeDraft(outcome({ unchanged: [{ path: "/a/x", sha256: "h" }] }));
    expect(draft.files).toEqual([]);
  });

  it("an update keeps tracked unchanged files, drops removed ones, and refreshes written ones", () => {
    const previous = entry({
      files: [
        { path: "/a/keep", sha256: "old" },
        { path: "/a/gone", sha256: "old" },
        { path: "/a/new-version", sha256: "old" },
      ],
      mcpServers: ["srv"],
      backups: { "/a/keep": "/backup/keep" },
    });
    const draft = composeDraft(
      outcome({
        unchanged: [{ path: "/a/keep", sha256: "same" }],
        removed: ["/a/gone"],
        written: [{ path: "/a/new-version", sha256: "fresh" }],
        // a backup of an already-tracked file holds an older install; it must not become the restore point
        restorePoints: { "/a/new-version": "/backup/older-install", "/a/created": "/backup/orig" },
        mcpServers: ["srv2"],
      }),
      previous,
    );
    expect(draft.files).toEqual([
      { path: "/a/keep", sha256: "same" },
      { path: "/a/new-version", sha256: "fresh" },
    ]);
    expect(draft.mcpServers).toEqual(["srv", "srv2"]);
    expect(draft.backups).toEqual({ "/a/created": "/backup/orig", "/a/keep": "/backup/keep" });
  });

  it("keeps the original `previous`/`root` of a pointer an earlier run owned and unions arrays", () => {
    const previous = entry({
      settingsEntries: [
        { pointer: "/model", value: "a", previous: "orig" },
        { pointer: "/permissions/allow", value: ["x"], root: "/permissions" },
      ],
    });
    const draft = composeDraft(
      outcome({
        settingsEntries: [
          { pointer: "/model", value: "b", previous: "a" },
          { pointer: "/permissions/allow", value: ["x", "y"] },
          { pointer: "/env", value: {}, root: "/env" },
        ],
      }),
      previous,
    );
    expect(draft.settingsEntries).toEqual([
      { pointer: "/model", value: "b", previous: "orig" },
      { pointer: "/permissions/allow", value: ["x", "y"], root: "/permissions" },
      { pointer: "/env", value: {}, root: "/env" },
    ]);
  });

  it("merges marketplace plugin lists", () => {
    const previous = entry({ marketplace: { name: "m", plugins: ["a"] } });
    const draft = composeDraft(outcome({ marketplace: { name: "m", plugins: ["b"] } }), previous);
    expect(draft.marketplace).toEqual({ name: "m", plugins: ["a", "b"] });
  });
});

describe("revertSettingsEntries", () => {
  const round = (before: Record<string, unknown>, pointer: string, incoming: unknown) => {
    const { doc, added } = applySettingsOp(before, { itemId: "i", pointer, incoming });
    return { doc, added, reverted: revertSettingsEntries(doc, added) };
  };

  it("removes a created key and prunes the containers the merge created", () => {
    const { reverted, added } = round({ model: "x" }, toPointer("hooks", "PreToolUse"), [{ a: 1 }]);
    expect(added[0].root).toBe("/hooks");
    expect(JSON.stringify(reverted)).toBe(JSON.stringify({ model: "x" }));
  });

  it("keeps a pre-existing empty container", () => {
    const { reverted } = round({ hooks: {} }, toPointer("hooks", "PreToolUse"), [1]);
    expect(reverted).toEqual({ hooks: {} });
  });

  it("removes only appended array elements", () => {
    const { reverted } = round({ permissions: { allow: ["a"] } }, "/permissions/allow", ["a", "b"]);
    expect(reverted).toEqual({ permissions: { allow: ["a"] } });
  });

  it("restores a replaced scalar and keeps a pre-existing empty array", () => {
    expect(round({ model: "old" }, "/model", "new").reverted).toEqual({ model: "old" });
    expect(round({ list: [] }, "/list", ["a"]).reverted).toEqual({ list: [] });
  });

  it("is idempotent and tolerates keys already removed", () => {
    const { doc, added } = round({}, "/model", "x");
    const once = revertSettingsEntries(doc, added);
    expect(revertSettingsEntries(once, added)).toEqual(once);
  });

  it("leaves elements another install added to a shared array", () => {
    const { added } = round({ permissions: { allow: [] } }, "/permissions/allow", ["a"]);
    const shared = { permissions: { allow: ["a", "other"] } };
    expect(revertSettingsEntries(shared, added)).toEqual({ permissions: { allow: ["other"] } });
  });
});

describe("uninstall", () => {
  async function installed(files: Record<string, string>, extra: Partial<EntryDraft> = {}) {
    await Promise.all(
      Object.entries(files).map(async ([rel, text]) => {
        await mkdir(join(root, rel, ".."), { recursive: true });
        await writeFile(join(root, rel), text);
      }),
    );
    const { id: _id, installedAt: _at, ...rest } = entry();
    return recordEntry({
      ...rest,
      files: Object.entries(files).map(([rel, text]) => ({
        path: join(root, rel),
        sha256: sha256(text),
      })),
      ...extra,
    });
  }

  it("rejects an unknown id", async () => {
    await expect(uninstall("nope")).rejects.toMatchObject({ code: "INSTALL_NOT_FOUND" });
  });

  it("refuses to touch files outside the scope root", async () => {
    const { id: _id, installedAt: _at, ...rest } = entry();
    const saved = await recordEntry({ ...rest, files: [{ path: "/etc/hosts", sha256: "x" }] });
    await expect(uninstall(saved.id)).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("restores the backup of a file the install had overwritten", async () => {
    const backup = join(root, "orig.bak");
    await writeFile(backup, "original");
    const saved = await installed(
      { "skills/pdf/SKILL.md": "body" },
      {
        backups: { [join(root, "skills/pdf/SKILL.md")]: backup },
      },
    );
    await uninstall(saved.id);
    expect(await readFile(join(root, "skills/pdf/SKILL.md"), "utf8")).toBe("original");
  });

  it("skips files already deleted by hand and still drops the entry", async () => {
    const saved = await installed({ "skills/pdf/SKILL.md": "body" });
    await rm(join(root, "skills"), { recursive: true });
    const result = await uninstall(saved.id);
    expect(result.removedFiles).toHaveLength(1);
    expect(await listEntries()).toEqual([]);
  });

  it("keeps a marketplace key that another plugin from the same marketplace still uses", async () => {
    const settings = {
      extraKnownMarketplaces: { m: { source: { source: "github", repo: "o/r" } } },
    };
    await writeFile(join(root, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
    const mine = {
      pointer: "/extraKnownMarketplaces/m",
      value: settings.extraKnownMarketplaces.m,
      root: "/extraKnownMarketplaces",
    };
    const first = await installed(
      {},
      { settingsEntries: [mine], marketplace: { name: "m", plugins: ["a"] } },
    );
    await installed(
      {},
      {
        source: { ...entry().source, path: "plugins/b" },
        marketplace: { name: "m", plugins: ["b"] },
      },
    );
    const result = await uninstall(first.id);
    expect(result.revertedEntries).toEqual([]);
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toEqual(settings);
    await expect(stat(join(root, "claude-desk"))).resolves.toBeTruthy();
  });

  describe("with edited merged settings", () => {
    const hook = { hooks: [{ type: "command", command: "echo hi" }] };
    const settingsFile = () => join(root, "settings.json");

    async function installedHook() {
      await writeFile(settingsFile(), `${JSON.stringify({ hooks: { PreToolUse: [hook] } })}\n`);
      return installed(
        {},
        {
          settingsEntries: [{ pointer: "/hooks/PreToolUse", value: [hook], root: "/hooks" }],
        },
      );
    }

    async function editHookCommand() {
      const edited = { hooks: [{ type: "command", command: "echo EDITED" }] };
      await writeFile(settingsFile(), JSON.stringify({ hooks: { PreToolUse: [edited] } }));
    }

    it("is blocked, listing the edited entry, and changes nothing", async () => {
      const saved = await installedHook();
      await editHookCommand();
      const before = await readFile(settingsFile(), "utf8");

      await expect(uninstall(saved.id)).rejects.toMatchObject({
        code: "LOCALLY_MODIFIED",
        details: { files: [`${settingsFile()}#/hooks/PreToolUse`] },
      });

      expect(await readFile(settingsFile(), "utf8")).toBe(before);
      expect(await listEntries()).toHaveLength(1);
    });

    it("proceeds when forced", async () => {
      const saved = await installedHook();
      await editHookCommand();
      await uninstall(saved.id, { force: true });
      expect(await listEntries()).toEqual([]);
    });

    it("is not blocked when the settings are untouched", async () => {
      const saved = await installedHook();
      await uninstall(saved.id);
      expect(await listEntries()).toEqual([]);
    });
  });
});
