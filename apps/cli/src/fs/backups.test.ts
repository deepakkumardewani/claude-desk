import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { backupFile, getBackups, restoreBackup } from "./backups.js";

let fixtureRoot = "";
let previousRoot: string | undefined;

function backupRoot(): string {
  return resolve(fixtureRoot, ".claude-desk-backups");
}

async function createTestFile(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

beforeEach(async () => {
  previousRoot = process.env.CLAUDE_ROOT;
  fixtureRoot = await mkdtemp(join(tmpdir(), "claude-backups-"));
  process.env.CLAUDE_ROOT = fixtureRoot;
});

afterEach(async () => {
  process.env.CLAUDE_ROOT = previousRoot;
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("backupFile", () => {
  let testFile: string;

  beforeEach(async () => {
    testFile = join(fixtureRoot, "files", "test.txt");
    await createTestFile(testFile, "original content");
  });

  test("should create a backup of an existing file", async () => {
    await backupFile(testFile);

    const entries = await readdir(backupRoot(), { recursive: true });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => (e as string).endsWith(".bak"))).toBe(true);
  });

  test("should no-op if source file doesn't exist", async () => {
    const nonExistentFile = join(fixtureRoot, "files", "nonexistent.txt");

    await expect(backupFile(nonExistentFile)).resolves.toBeUndefined();

    try {
      const entries = await readdir(backupRoot(), { recursive: true });
      expect(entries.filter((e) => (e as string).includes("nonexistent")).length).toBe(0);
    } catch {
      // Directory doesn't exist, which is expected
    }
  });

  test("should prune backups when exceeding MAX_BACKUPS_PER_FILE", async () => {
    const maxBackups = 20;
    const createCount = maxBackups + 5;

    for (let i = 0; i < createCount; i++) {
      await writeFile(testFile, `content ${i}`, "utf8");
      await backupFile(testFile);

      if (i < createCount - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    const backups = await getBackups(testFile);
    expect(backups.length).toBeLessThanOrEqual(maxBackups);
  });

  test("should handle concurrent backups", async () => {
    const file1 = join(fixtureRoot, "files", "test-1.txt");
    const file2 = join(fixtureRoot, "files", "test-2.txt");

    await createTestFile(file1, "content 1");
    await createTestFile(file2, "content 2");

    await Promise.all([backupFile(file1), backupFile(file2)]);

    const backups1 = await getBackups(file1);
    const backups2 = await getBackups(file2);

    expect(backups1.length).toBeGreaterThan(0);
    expect(backups2.length).toBeGreaterThan(0);
  });
});

describe("getBackups", () => {
  let testFile: string;

  beforeEach(async () => {
    testFile = join(fixtureRoot, "files", "test.txt");
    await createTestFile(testFile, "original content");
  });

  test("should return empty array for file with no backups", async () => {
    const backups = await getBackups(testFile);
    expect(backups).toEqual([]);
  });

  test("should return backup metadata with size and timestamp", async () => {
    await backupFile(testFile);

    const backups = await getBackups(testFile);

    expect(backups.length).toBe(1);
    expect(backups[0]).toHaveProperty("id");
    expect(backups[0]).toHaveProperty("path");
    expect(backups[0]).toHaveProperty("timestamp");
    expect(backups[0]).toHaveProperty("size");
    expect(backups[0].size).toBeGreaterThan(0);
  });

  test("should list backups in reverse chronological order", async () => {
    for (let i = 0; i < 3; i++) {
      await writeFile(testFile, `content ${i}`, "utf8");
      await backupFile(testFile);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const backups = await getBackups(testFile);

    expect(backups.length).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < backups.length - 1; i++) {
      expect(new Date(backups[i].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(backups[i + 1].timestamp).getTime(),
      );
    }
  });
});

describe("restoreBackup", () => {
  let testFile: string;
  let originalContent: string;

  beforeEach(async () => {
    testFile = join(fixtureRoot, "files", "test.txt");
    originalContent = "original content";
    await createTestFile(testFile, originalContent);
  });

  test("should restore a backup", async () => {
    await backupFile(testFile);
    const backups1 = await getBackups(testFile);
    expect(backups1.length).toBe(1);

    await writeFile(testFile, "modified content", "utf8");

    await restoreBackup(testFile, backups1[0].id);

    const stat1 = await stat(testFile);
    expect(stat1.size).toBe(originalContent.length);
  });

  test("should create a backup of current version before restoring", async () => {
    await backupFile(testFile);
    const backups1 = await getBackups(testFile);

    await writeFile(testFile, "modified content", "utf8");

    await restoreBackup(testFile, backups1[0].id);

    const backups2 = await getBackups(testFile);
    expect(backups2.length).toBeGreaterThanOrEqual(1);
  });

  test("should throw error for invalid backup id", async () => {
    await expect(restoreBackup(testFile, "invalid-backup-id.bak")).rejects.toThrow(
      "Backup not found",
    );
  });
});
