import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  diffSnapshots,
  EXCLUDED_HOME_PATHS,
  snapshotRealHome,
  type SnapshotDiff,
} from "./realHomeGuard.js";

// Every test here builds a FAKE "real home" in a temp dir and passes it by parameter.
// The developer's actual home is never read or written.
let fakeHome = "";

function write(relative: string, content: string): void {
  const path = join(fakeHome, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function diffAfter(mutate: () => void): SnapshotDiff {
  const before = snapshotRealHome({ home: fakeHome });
  mutate();
  return diffSnapshots(before, snapshotRealHome({ home: fakeHome }));
}

const EMPTY: SnapshotDiff = { added: [], removed: [], changed: [] };

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "fake-real-home-"));
  write(".claude/settings.json", "{}");
  write(".claude/skills/a/SKILL.md", "a");
  write(".claude.json", "{}");
  write(".claude-other/file.txt", "x");
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("realHomeGuard", () => {
  it("diffs clean when nothing changed", () => {
    expect(diffAfter(() => {})).toEqual(EMPTY);
  });

  it("detects a canary added to a compared path", () => {
    const diff = diffAfter(() => write(".claude-canary-fixture", "boom"));
    expect(diff.added).toEqual([".claude-canary-fixture"]);
  });

  it("detects added, changed and removed files across the compared tree", () => {
    const diff = diffAfter(() => {
      write(".claude/skills/new/SKILL.md", "n");
      write(".claude/settings.json", '{"x":1}');
      rmSync(join(fakeHome, ".claude-other/file.txt"));
    });
    expect(diff.added).toEqual([".claude/skills/new/SKILL.md"]);
    expect(diff.changed.sort()).toEqual([".claude/settings.json"]);
    expect(diff.removed).toEqual([".claude-other/file.txt"]);
  });

  it("ignores writes to every excluded runtime-state path", () => {
    expect(EXCLUDED_HOME_PATHS.length).toBeGreaterThan(0);
    const diff = diffAfter(() => {
      for (const { path } of EXCLUDED_HOME_PATHS) {
        write(path.endsWith("/") ? `${path}x.json` : path, "live");
      }
    });
    expect(diff).toEqual(EMPTY);
  });

  it("tolerates new and appended transcripts under projects/ but not truncation or removal", () => {
    write(".claude/projects/p/s.jsonl", "line1\n");
    const before = snapshotRealHome({ home: fakeHome });

    write(".claude/projects/p/new.jsonl", "n\n");
    appendFileSync(join(fakeHome, ".claude/projects/p/s.jsonl"), "line2\n");
    expect(diffSnapshots(before, snapshotRealHome({ home: fakeHome }))).toEqual(EMPTY);

    write(".claude/projects/p/s.jsonl", "");
    expect(diffSnapshots(before, snapshotRealHome({ home: fakeHome })).changed).toEqual([
      ".claude/projects/p/s.jsonl",
    ]);

    rmSync(join(fakeHome, ".claude/projects/p/s.jsonl"));
    expect(diffSnapshots(before, snapshotRealHome({ home: fakeHome })).removed).toEqual([
      ".claude/projects/p/s.jsonl",
    ]);
  });

  it("flags non-transcript changes under projects/", () => {
    write(".claude/projects/p/notes.md", "a");
    const diff = diffAfter(() => write(".claude/projects/p/notes.md", "b"));
    expect(diff.changed).toEqual([".claude/projects/p/notes.md"]);
  });

  it("tolerates a missing ~/.claude and ~/.claude.json", () => {
    const empty = mkdtempSync(join(tmpdir(), "fake-empty-home-"));
    try {
      expect(snapshotRealHome({ home: empty })).toEqual({});
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("uses size and mtime for large files instead of hashing", () => {
    write(".claude/big.bin", "z".repeat(1024 * 1024 + 1));
    const snapshot = snapshotRealHome({ home: fakeHome });
    const entry = snapshot[".claude/big.bin"];
    expect(entry.sha256).toBeUndefined();
    expect(entry.mtimeMs).toBeGreaterThan(0);
    expect(snapshot[".claude/settings.json"].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
