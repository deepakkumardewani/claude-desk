import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiscoveredItem } from "schema";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { DiscoverError } from "./errors.js";
import {
  buildPlan,
  collectMerges,
  collectWrites,
  readDiskState,
  readMergeState,
  sanitizeName,
  type FetchedItem,
  type MergeState,
} from "./plan.js";

let root = "";
let previousRoot: string | undefined;

beforeEach(async () => {
  previousRoot = process.env.CLAUDE_ROOT;
  root = await mkdtemp(join(tmpdir(), "claude-plan-"));
  process.env.CLAUDE_ROOT = root;
});

afterEach(async () => {
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(root, { recursive: true, force: true });
});

const USER = { scope: "user" } as const;

function skill(overrides: Partial<DiscoveredItem> = {}, body = "# hello"): FetchedItem {
  const item: DiscoveredItem = {
    id: "skill:skills/pdf",
    kind: "skill",
    name: "PDF Tools",
    description: "Work with pdf files",
    path: "skills/pdf",
    files: [
      { path: "skills/pdf/SKILL.md", size: body.length, blobSha: "a" },
      { path: "skills/pdf/scripts/run.py", size: 5, blobSha: "b" },
    ],
    ...overrides,
  };
  return {
    item,
    files: new Map([
      ["skills/pdf/SKILL.md", body],
      ["skills/pdf/scripts/run.py", "print"],
    ]),
  };
}

function single(kind: "agent" | "command", name: string, path: string): FetchedItem {
  return {
    item: {
      id: `${kind}:${path}`,
      kind,
      name,
      path,
      files: [{ path, size: 4, blobSha: "c" }],
    },
    files: new Map([[path, "body"]]),
  };
}

const expectRejected = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DiscoverError);
    expect((error as DiscoverError).code).toBe("BAD_INPUT");
    return;
  }
  throw new Error("expected a typed rejection");
};

describe("buildPlan file writes", () => {
  it("plans a new skill at skills/<name>/… inside the user root", () => {
    const plan = buildPlan([skill()], USER, new Map());
    expect(plan.fileWrites).toEqual([
      {
        itemId: "skill:skills/pdf",
        targetPath: join(root, "skills/pdf-tools/SKILL.md"),
        status: "new",
        bytes: 7,
      },
      {
        itemId: "skill:skills/pdf",
        targetPath: join(root, "skills/pdf-tools/scripts/run.py"),
        status: "new",
        bytes: 5,
      },
    ]);
    expect(plan.planHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("plans agents and commands (namespaced subdirs preserved) and project scope", () => {
    const plan = buildPlan(
      [
        single("agent", "Code Reviewer", ".claude/agents/reviewer.md"),
        single("command", "git/Commit", ".claude/commands/git/commit.md"),
      ],
      { scope: "project", projectDir: "/work/app" },
      new Map(),
    );
    expect(plan.fileWrites.map((w) => w.targetPath)).toEqual([
      "/work/app/.claude/agents/code-reviewer.md",
      "/work/app/.claude/commands/git/commit.md",
    ]);
  });

  it("marks byte-identical files identical and changed files conflict", () => {
    const writes = collectWrites([skill()], USER);
    const disk = new Map([
      [writes[0].targetPath, writes[0].content],
      [writes[1].targetPath, "different"],
    ]);
    const plan = buildPlan([skill()], USER, disk);
    expect(plan.fileWrites.map((w) => w.status)).toEqual(["identical", "conflict"]);
  });

  it("reads disk state, treating missing paths and file-in-the-way as absent", async () => {
    const writes = collectWrites([skill()], USER);
    await mkdir(join(root, "skills/pdf-tools"), { recursive: true });
    await writeFile(writes[0].targetPath, "# hello");
    await writeFile(join(root, "skills/pdf-tools/scripts"), "i am a file");
    const state = await readDiskState(writes);
    expect([...state.keys()]).toEqual([writes[0].targetPath]);
  });

  it("includes trust findings and token estimates", () => {
    const plan = buildPlan([skill()], USER, new Map());
    expect(plan.findings.some((f) => f.rule === "token-cost")).toBe(true);
    expect(plan.tokenEstimates["skill:skills/pdf"]).toBe(
      Math.ceil("Work with pdf files".length / 4),
    );
    expect(plan.findings.some((f) => f.rule === "bundled-script")).toBe(true);
  });
});

describe("path safety", () => {
  it.each([
    ["dot-dot inner path", "skills/pdf/../../evil.md"],
    ["absolute inner path", "/etc/passwd"],
    ["nul byte", "skills/pdf/a\0b.md"],
    ["backslash", "skills\\pdf\\a.md"],
  ])("rejects %s in a skill file", (_label, path) => {
    const entry = skill();
    entry.item.files = [{ path, size: 1, blobSha: "x" }];
    entry.files = new Map([[path, "x"]]);
    expectRejected(() => buildPlan([entry], USER, new Map()));
  });

  it("rejects dot-dot and absolute names for agents/commands", () => {
    expectRejected(() => buildPlan([single("agent", "../evil", "a.md")], USER, new Map()));
    expectRejected(() => buildPlan([single("command", "/abs/cmd", "a.md")], USER, new Map()));
    expectRejected(() => buildPlan([single("command", "a/../b", "a.md")], USER, new Map()));
  });

  it("rejects a relative projectDir as a typed error", () => {
    expectRejected(() =>
      buildPlan([skill()], { scope: "project", projectDir: "relative" }, new Map()),
    );
  });

  it("rejects non-copy kinds, oversized items and duplicate targets", () => {
    const hook = single("agent", "x", "a.md");
    hook.item.kind = "hook";
    expectRejected(() => buildPlan([hook], USER, new Map()));
    const convertible = single("agent", "x", "a.md");
    convertible.item.kind = "convertible";
    expectRejected(() => buildPlan([convertible], USER, new Map()));

    expectRejected(() => buildPlan([skill({ installable: false })], USER, new Map()));

    const a = single("agent", "same", "one.md");
    const b = single("agent", "Same", "two.md");
    expectRejected(() => buildPlan([a, b], USER, new Map()));
  });

  it("sanitizes names to [a-z0-9._-]", () => {
    expect(sanitizeName("My Cool_Skill!")).toBe("my-cool_skill");
    expect(sanitizeName("..hidden")).toBe("hidden");
    expect(() => sanitizeName("***")).toThrow(DiscoverError);
  });
});

describe("planHash", () => {
  const base = () => buildPlan([skill()], USER, new Map()).planHash;

  it("is stable for identical inputs", () => {
    expect(buildPlan([skill()], USER, new Map()).planHash).toBe(base());
  });

  it("changes when items change", () => {
    expect(buildPlan([skill({}, "# other")], USER, new Map()).planHash).not.toBe(base());
    expect(buildPlan([skill({ id: "skill:skills/other" })], USER, new Map()).planHash).not.toBe(
      base(),
    );
  });

  it("changes when the target changes", () => {
    const project = { scope: "project", projectDir: "/work/app" } as const;
    expect(buildPlan([skill()], project, new Map()).planHash).not.toBe(base());
  });

  it("changes when disk state changes, even between two conflicting contents", () => {
    const [first] = collectWrites([skill()], USER);
    const one = buildPlan([skill()], USER, new Map([[first.targetPath, "v1"]])).planHash;
    const two = buildPlan([skill()], USER, new Map([[first.targetPath, "v2"]])).planHash;
    expect(one).not.toBe(base());
    expect(one).not.toBe(two);
  });
});

// ---------- merge kinds ----------

const SOURCE = { owner: "acme", repo: "Tools Repo" };

const state = (settings: Record<string, unknown> = {}, names: string[] = []): MergeState => ({
  settings,
  mcpNames: new Set(names),
});

function setting(key: string, value: unknown): FetchedItem {
  return {
    item: {
      id: `setting:.claude/settings.json#${key}`,
      kind: "setting",
      name: key,
      path: `.claude/settings.json#${key}`,
      files: [],
      payload: { key, value },
    },
    files: new Map(),
  };
}

const HOOK_COMMAND =
  'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/guard.sh && node ./.claude/hooks/lint.js --fast';

function hook(overrides: { missing?: string[]; event?: string } = {}): FetchedItem {
  const paths = [".claude/hooks/guard.sh", ".claude/hooks/lint.js"];
  const item: DiscoveredItem = {
    id: "hook:.claude/settings.json#hooks.PreToolUse[0]",
    kind: "hook",
    name: "PreToolUse (Bash)",
    path: ".claude/settings.json#hooks.PreToolUse[0]",
    files: paths.map((path) => ({ path, size: 4, blobSha: "h" })),
    payload: {
      event: overrides.event ?? "PreToolUse",
      matcher: "Bash",
      hooks: [{ type: "command", command: HOOK_COMMAND }],
      missingScripts: overrides.missing ?? [],
    },
  };
  return {
    item,
    source: SOURCE,
    files: new Map([
      [paths[0], "#!/bin/sh\necho guard"],
      [paths[1], "console.log(1)"],
    ]),
  };
}

function mcp(name: string, payload: Record<string, unknown>): FetchedItem {
  return {
    item: {
      id: `mcp:.mcp.json#${name}`,
      kind: "mcp",
      name,
      path: `.mcp.json#${name}`,
      files: [],
      payload,
    },
    files: new Map(),
  };
}

function plugin(payload: Record<string, unknown>, children: unknown[] = []): FetchedItem {
  return {
    item: {
      id: "plugin:.claude-plugin/marketplace.json#toolkit",
      kind: "plugin",
      name: "toolkit",
      path: ".claude-plugin/marketplace.json#toolkit",
      files: [],
      payload: { ...payload, children },
    },
    source: { owner: "acme", repo: "market" },
    files: new Map(),
  };
}

describe("settings merge planning", () => {
  it("plans a before/after diff for a permissions item", () => {
    const existing = { permissions: { allow: ["Read"] } };
    const plan = buildPlan(
      [setting("permissions", { allow: ["Bash(ls)"], deny: ["Bash(rm:*)"] })],
      USER,
      new Map(),
      state(existing),
    );
    expect(plan.settingsChanges).toEqual([
      {
        itemId: "setting:.claude/settings.json#permissions",
        pointer: "/permissions",
        before: existing.permissions,
        after: { allow: ["Read", "Bash(ls)"], deny: ["Bash(rm:*)"] },
      },
    ]);
    expect(plan.fileWrites).toEqual([]);
  });

  it("omits `before` for a new key and lists nothing once the value is already present", () => {
    const item = setting("model", "opus");
    const fresh = buildPlan([item], USER, new Map(), state());
    expect(fresh.settingsChanges).toEqual([
      { itemId: item.item.id, pointer: "/model", after: "opus" },
    ]);
    expect("before" in fresh.settingsChanges[0]).toBe(false);
    expect(buildPlan([item], USER, new Map(), state({ model: "opus" })).settingsChanges).toEqual(
      [],
    );
  });

  it("folds ops so a later item's `before` includes earlier additions", () => {
    const plan = buildPlan(
      [setting("permissions", { allow: ["A"] }), hook({ event: "PreToolUse" })],
      USER,
      new Map(),
      state(),
    );
    expect(plan.settingsChanges.map((c) => c.pointer)).toEqual([
      "/permissions",
      "/hooks/PreToolUse",
    ]);
  });

  it.each(["__proto__", "constructor"])("rejects the reserved key %s", (key) => {
    expectRejected(() => buildPlan([setting(key, { a: 1 })], USER, new Map(), state()));
    expectRejected(() =>
      buildPlan([setting("env", { [key]: "x" })], USER, new Map(), state({ env: { A: "b" } })),
    );
  });

  it("rejects a malformed payload and an existing non-object parent", () => {
    const bad = setting("x", 1);
    bad.item.payload = {};
    expectRejected(() => buildPlan([bad], USER, new Map(), state()));
    expectRejected(() => buildPlan([hook()], USER, new Map(), state({ hooks: "nope" })));
  });

  it("changes the plan hash when the merged value changes", () => {
    const a = buildPlan([setting("model", "a")], USER, new Map(), state()).planHash;
    const b = buildPlan([setting("model", "b")], USER, new Map(), state()).planHash;
    expect(a).not.toBe(b);
  });
});

describe("hook planning", () => {
  it("plans 2 scripts at hooks/<repo>-<file> and one rewritten settings entry (user scope)", () => {
    const plan = buildPlan([hook()], USER, new Map(), state());
    expect(plan.fileWrites.map((w) => w.targetPath)).toEqual([
      join(root, "hooks/tools-repo-guard.sh"),
      join(root, "hooks/tools-repo-lint.js"),
    ]);
    expect(plan.settingsChanges).toHaveLength(1);
    const [change] = plan.settingsChanges;
    expect(change.pointer).toBe("/hooks/PreToolUse");
    const command = (change.after as Array<{ hooks: Array<{ command: string }> }>)[0].hooks[0]
      .command;
    expect(command).toBe(
      `bash "${join(root, "hooks/tools-repo-guard.sh")}" && node ${join(root, "hooks/tools-repo-lint.js")} --fast`,
    );
    expect(command).not.toContain(".claude/hooks");
  });

  it("keeps project hooks portable via $CLAUDE_PROJECT_DIR", () => {
    const project = { scope: "project", projectDir: "/work/app" } as const;
    const plan = buildPlan([hook()], project, new Map(), state());
    expect(plan.fileWrites.map((w) => w.targetPath)).toEqual([
      "/work/app/.claude/hooks/tools-repo-guard.sh",
      "/work/app/.claude/hooks/tools-repo-lint.js",
    ]);
    const after = plan.settingsChanges[0].after as Array<{ hooks: Array<{ command: string }> }>;
    expect(after[0].hooks[0].command).toBe(
      'bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/tools-repo-guard.sh && node $CLAUDE_PROJECT_DIR/.claude/hooks/tools-repo-lint.js --fast',
    );
  });

  it("writes a script shared by two hook groups once, and rejects missing scripts or repo", () => {
    const second = hook({ event: "PostToolUse" });
    second.item.id = "hook:.claude/settings.json#hooks.PostToolUse[0]";
    expect(collectWrites([hook(), second], USER)).toHaveLength(2);
    expectRejected(() => collectMerges([hook({ missing: [".claude/hooks/gone.sh"] })], USER));
    const noSource = hook();
    delete noSource.source;
    expectRejected(() => collectWrites([noSource], USER));
  });

  it("marks an existing different script as a conflict", () => {
    const [first] = collectWrites([hook()], USER);
    const plan = buildPlan([hook()], USER, new Map([[first.targetPath, "other"]]), state());
    expect(plan.fileWrites[0].status).toBe("conflict");
  });
});

describe("mcp planning", () => {
  it("converts literal env values to ${KEY} placeholders and keeps existing placeholders", () => {
    const [entry] = collectMerges(
      [
        mcp("github", {
          command: "npx",
          args: ["-y", "srv"],
          env: { GITHUB_TOKEN: "ghp_realsecret123", REGION: "${AWS_REGION}" },
        }),
      ],
      USER,
    ).mcp;
    expect(entry.server.transport).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "srv"],
      env: { GITHUB_TOKEN: "${GITHUB_TOKEN}", REGION: "${AWS_REGION}" },
    });
    expect(JSON.stringify(entry)).not.toContain("ghp_realsecret123");
  });

  it("plans http servers and placeholders secret-looking headers", () => {
    const [entry] = collectMerges(
      [
        mcp("api", {
          type: "sse",
          url: "https://x.dev/mcp",
          headers: { Authorization: "Bearer abc", Accept: "json" },
        }),
      ],
      USER,
    ).mcp;
    expect(entry.server.transport).toEqual({
      type: "sse",
      url: "https://x.dev/mcp",
      headers: { Authorization: "${AUTHORIZATION}", Accept: "json" },
    });
  });

  it("marks a name collision as conflict and a free name as new", () => {
    const item = mcp("github", { command: "npx" });
    expect(buildPlan([item], USER, new Map(), state()).mcpChanges).toEqual([
      { itemId: item.item.id, name: "github", status: "new" },
    ]);
    expect(buildPlan([item], USER, new Map(), state({}, ["github"])).mcpChanges[0].status).toBe(
      "conflict",
    );
  });

  it("rejects unusable servers and option-looking names", () => {
    expectRejected(() => collectMerges([mcp("nothing", {})], USER));
    expectRejected(() => collectMerges([mcp("--evil", { command: "x" })], USER));
  });

  it("reads only the config the selection needs", async () => {
    const none = await readMergeState(USER, { settingsOps: [], mcp: [] });
    expect(none.settings).toEqual({});
    expect(none.mcpNames.size).toBe(0);
    await writeFile(join(root, "settings.json"), JSON.stringify({ model: "m" }));
    const merges = collectMerges([setting("model", "x")], USER);
    expect((await readMergeState(USER, merges)).settings).toEqual({ model: "m" });
    await writeFile(join(root, "settings.json"), "{ nope");
    await expect(readMergeState(USER, merges)).rejects.toBeInstanceOf(DiscoverError);
  });
});

describe("plugin planning", () => {
  const info = { plugin: "toolkit", marketplace: "acme-market" };

  it("produces only marketplace changes, with no files and no settings entries", () => {
    const child = single("command", "child", "market/commands/child.md").item;
    const plan = buildPlan([plugin(info, [child])], USER, new Map(), state());
    expect(plan.marketplaceChanges).toEqual([
      { itemId: "plugin:.claude-plugin/marketplace.json#toolkit", ...info },
    ]);
    expect(plan.fileWrites).toEqual([]);
    expect(plan.settingsChanges).toEqual([]);
  });

  it("emits exactly the two spec keys", () => {
    const { settingsOps } = collectMerges([plugin(info)], USER);
    expect(settingsOps.map(({ pointer, incoming }) => ({ pointer, incoming }))).toEqual([
      {
        pointer: "/extraKnownMarketplaces/acme-market",
        incoming: { source: { source: "github", repo: "acme/market" } },
      },
      { pointer: "/enabledPlugins/toolkit@acme-market", incoming: true },
    ]);
  });

  it("lists nothing when already installed, and refuses a marketplace from another repo", () => {
    const installed = state({
      extraKnownMarketplaces: {
        "acme-market": { source: { source: "github", repo: "acme/market" } },
      },
      enabledPlugins: { "toolkit@acme-market": true },
    });
    expect(buildPlan([plugin(info)], USER, new Map(), installed).marketplaceChanges).toEqual([]);
    const other = state({
      extraKnownMarketplaces: {
        "acme-market": { source: { source: "github", repo: "evil/market" } },
      },
    });
    expectRejected(() => buildPlan([plugin(info)], USER, new Map(), other));
  });

  it("rejects plugins without a marketplace", () => {
    expectRejected(() => collectMerges([plugin({ plugin: "solo" })], USER));
  });
});

describe("buildPlan: convertible items", () => {
  function convertible(
    path: string,
    name: string,
    convertsTo: "skill" | "command" | "agent",
    content: string,
  ): FetchedItem {
    return {
      item: {
        id: `convertible:${path}`,
        kind: "convertible",
        name,
        path,
        convertsTo,
        files: [{ path, size: content.length, blobSha: "c" }],
      },
      source: { owner: "acme", repo: "widgets" },
      files: new Map([[path, content]]),
    };
  }

  it("writes a selected .mdc at skills/<slug>/SKILL.md, not its original path", () => {
    const entry = convertible(
      ".cursor/rules/style.mdc",
      "style",
      "skill",
      "---\ndescription: S\n---\nUse tabs.",
    );
    const plan = buildPlan([entry], USER, new Map());
    expect(plan.fileWrites).toHaveLength(1);
    expect(plan.fileWrites[0].targetPath).toBe(join(root, "skills", "style", "SKILL.md"));
    expect(plan.fileWrites[0].targetPath).not.toContain(".cursor");
    const [write] = collectWrites([entry], USER);
    expect(write.content).toContain("Use tabs.");
    expect(write.content).toContain('name: "style"');
  });

  it("routes prompts to commands and chatmodes to agents, surfacing the dropped-tools note", () => {
    const prompt = convertible(".github/prompts/r.prompt.md", "r", "command", "Do ${input:x}");
    const mode = convertible(
      ".github/chatmodes/p.chatmode.md",
      "p",
      "agent",
      "---\ndescription: P\ntools: ['a']\n---\nbody",
    );
    const plan = buildPlan([prompt, mode], USER, new Map());
    expect(plan.fileWrites.map((w) => w.targetPath)).toEqual([
      join(root, "commands", "r.md"),
      join(root, "agents", "p.md"),
    ]);
    expect(plan.findings.some((f) => f.rule === "allowed-tools" && f.severity === "info")).toBe(
      true,
    );
  });
});
