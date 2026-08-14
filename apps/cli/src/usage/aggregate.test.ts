import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import {
  loadAllRecords,
  clearCache,
  filterByPeriod,
  computeOverview,
  computeToday,
  computeBlocks,
  computeSessions,
  computeModels,
  computeProjects,
  computeTimeline,
  computeHeatmap,
  getAggregatedUsage,
} from "./aggregate.js";
import type { UsageRecord } from "./parser.js";
import { sampleTranscriptContent } from "./fixtures.js";
import { readdir, readFile, stat } from "node:fs/promises";

// Mock the filesystem operations
vi.mock("node:fs/promises");

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockReadFile = vi.mocked(readFile);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    model: "claude-sonnet-4-6",
    project: "project-a",
    date: "2026-07-10",
    timestampMs: Date.parse("2026-07-10T10:00:00.000Z"),
    sessionId: "session-1",
    dedupeKey: undefined,
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.01,
    ...overrides,
  };
}

/** Mock a single project directory containing one session file. */
function mockSingleFileTree(fileName = "session-xyz.jsonl", projectName = "my-project") {
  mockReaddir.mockImplementation(async (path: any) => {
    if (String(path).endsWith(projectName)) {
      return [{ name: fileName, isFile: () => true, isDirectory: () => false }] as any;
    }
    return [{ name: projectName, isFile: () => false, isDirectory: () => true }] as any;
  });
}

describe("loadAllRecords / clearCache", () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCache();
  });

  it("should return an empty array when the projects directory is empty", async () => {
    mockReaddir.mockResolvedValueOnce([] as any);
    const records = await loadAllRecords();
    expect(records).toEqual([]);
  });

  it("should return an empty array when the projects directory doesn't exist", async () => {
    mockReaddir.mockRejectedValueOnce(new Error("ENOENT"));
    const records = await loadAllRecords();
    expect(records).toEqual([]);
  });

  it("should skip project directories that can't be read", async () => {
    mockReaddir.mockImplementation(async (path: any) => {
      if (String(path).endsWith("locked-project")) {
        throw new Error("Permission denied");
      }
      return [{ name: "locked-project", isFile: () => false, isDirectory: () => true }] as any;
    });
    const records = await loadAllRecords();
    expect(records).toEqual([]);
  });

  it("should attach sessionId from the file path and derive project from the transcript's cwd", async () => {
    mockSingleFileTree();
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    mockReadFile.mockResolvedValue(sampleTranscriptContent);

    const records = await loadAllRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.sessionId).toBe("session-xyz");
      // Derived from the shortest cwd in sampleTranscriptContent (react/cc-studio),
      // not the raw "my-project" mock directory name — see resolveSessionProjectName.
      expect(record.project).toBe("react/cc-studio");
    }
  });

  it("should skip non-jsonl files", async () => {
    mockReaddir.mockResolvedValue([
      { name: "readme.md", isFile: () => true, isDirectory: () => false } as any,
      { name: "subdir", isFile: () => false, isDirectory: () => true } as any,
    ]);
    const records = await loadAllRecords();
    expect(records).toEqual([]);
  });

  it("should return an empty array for files that can't be read", async () => {
    mockSingleFileTree();
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    mockReadFile.mockRejectedValue(new Error("Permission denied"));

    const records = await loadAllRecords();
    expect(records).toEqual([]);
  });

  it("should not re-read a file when its mtime is unchanged (per-file cache)", async () => {
    mockSingleFileTree();
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    mockReadFile.mockResolvedValue("");

    await loadAllRecords();
    expect(mockReadFile).toHaveBeenCalledTimes(1);

    mockReadFile.mockClear();
    await loadAllRecords();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("should re-read a file when its mtime changes", async () => {
    mockSingleFileTree();
    let mtime = 1000;
    mockStat.mockImplementation(async () => ({ mtimeMs: mtime }) as any);
    mockReadFile.mockResolvedValue("");

    await loadAllRecords();
    mtime = 2000;
    mockReadFile.mockClear();
    await loadAllRecords();

    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it("should re-read all files after clearCache even when mtime is unchanged", async () => {
    mockSingleFileTree();
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    mockReadFile.mockResolvedValue("");

    await loadAllRecords();
    mockReadFile.mockClear();
    clearCache();
    await loadAllRecords();

    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });
});

describe("filterByPeriod", () => {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const tenDaysAgo = new Date(now - 10 * DAY_MS).toISOString().slice(0, 10);
  const twentyDaysAgo = new Date(now - 20 * DAY_MS).toISOString().slice(0, 10);
  const sixtyDaysAgo = new Date(now - 60 * DAY_MS).toISOString().slice(0, 10);

  const records = [
    makeRecord({ date: today, dedupeKey: "r1" }),
    makeRecord({ date: tenDaysAgo, dedupeKey: "r2" }),
    makeRecord({ date: twentyDaysAgo, dedupeKey: "r3" }),
    makeRecord({ date: sixtyDaysAgo, dedupeKey: "r4" }),
  ];

  it("should return only today's records for period=today", () => {
    const result = filterByPeriod(records, { period: "today" });
    expect(result).toEqual([records[0]]);
  });

  it("should return the last 7 days for period=7d", () => {
    const result = filterByPeriod(records, { period: "7d" });
    expect(result).toEqual([records[0]]);
  });

  it("should return the last 30 days for period=30d", () => {
    const result = filterByPeriod(records, { period: "30d" });
    expect(result).toEqual([records[0], records[1], records[2]]);
  });

  it("should return all records for period=all or no period", () => {
    expect(filterByPeriod(records, { period: "all" })).toEqual(records);
    expect(filterByPeriod(records)).toEqual(records);
  });

  it("should prefer since/until over period when both are given", () => {
    const result = filterByPeriod(records, {
      since: twentyDaysAgo,
      until: tenDaysAgo,
      period: "today",
    });
    expect(result).toEqual([records[1], records[2]]);
  });
});

describe("computeOverview", () => {
  it("should sum tokens/cost and count distinct sessions and projects", () => {
    const records = [
      makeRecord({ sessionId: "s1", project: "p1", cost: 1, inputTokens: 100 }),
      makeRecord({ sessionId: "s1", project: "p1", cost: 2, inputTokens: 200 }),
      makeRecord({ sessionId: "s2", project: "p2", cost: 3, inputTokens: 300 }),
    ];
    const overview = computeOverview(records);

    expect(overview.cost).toBeCloseTo(6, 10);
    expect(overview.inputTokens).toBe(600);
    expect(overview.sessionCount).toBe(2);
    expect(overview.projectCount).toBe(2);
  });

  it("should return zeros for an empty record set", () => {
    const overview = computeOverview([]);
    expect(overview.cost).toBe(0);
    expect(overview.sessionCount).toBe(0);
    expect(overview.projectCount).toBe(0);
  });
});

describe("computeToday", () => {
  it("should only include records from today, split by model", () => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const yesterday = new Date(now - DAY_MS).toISOString().slice(0, 10);

    const records = [
      makeRecord({ date: today, model: "claude-sonnet-4-6", cost: 1 }),
      makeRecord({ date: today, model: "claude-haiku-4-5", cost: 0.5 }),
      makeRecord({ date: yesterday, model: "claude-sonnet-4-6", cost: 5 }),
    ];

    const result = computeToday(records, now);
    expect(result.date).toBe(today);
    expect(result.turns).toBe(2);
    expect(result.cost).toBeCloseTo(1.5, 10);
    expect(Object.keys(result.byModel).sort()).toEqual(["claude-haiku-4-5", "claude-sonnet-4-6"]);
    expect(result.byModel["claude-sonnet-4-6"].turns).toBe(1);
  });
});

describe("computeBlocks", () => {
  it("should group records into 5h windows and mark the newest as active", () => {
    const blockStart = Date.parse("2026-07-10T00:00:00.000Z");
    const records = [
      makeRecord({ timestampMs: blockStart, cost: 1 }),
      makeRecord({ timestampMs: blockStart + HOUR_MS, cost: 1 }),
      // 6h later — starts a new block
      makeRecord({ timestampMs: blockStart + 6 * HOUR_MS, cost: 2 }),
    ];

    const now = blockStart + 6 * HOUR_MS + HOUR_MS; // 1h into the second block
    const blocks = computeBlocks(records, { limit: 20, now });

    expect(blocks.length).toBe(2);
    // Newest first
    expect(blocks[0].cost).toBeCloseTo(2, 10);
    expect(blocks[0].active).toBe(true);
    expect(blocks[0].progressPct).toBeCloseTo(20, 5); // 1h / 5h

    expect(blocks[1].cost).toBeCloseTo(2, 10);
    expect(blocks[1].active).toBe(false);
    expect(blocks[1].progressPct).toBe(100);
  });

  it("should compute burn rate and a linear cost projection for the active block", () => {
    const blockStart = Date.parse("2026-07-10T00:00:00.000Z");
    const records = [makeRecord({ timestampMs: blockStart, cost: 2 })];
    const now = blockStart + HOUR_MS; // 1h elapsed, 4h remaining

    const [block] = computeBlocks(records, { now });
    expect(block.burnPerHour).toBeCloseTo(2, 10);
    expect(block.projectedCost).toBeCloseTo(2 + 2 * 4, 10);
  });

  it("should ignore records without a valid timestamp", () => {
    const records = [makeRecord({ timestampMs: 0 })];
    expect(computeBlocks(records)).toEqual([]);
  });
});

describe("computeSessions", () => {
  const records = [
    makeRecord({ sessionId: "s1", cost: 5, timestampMs: 1000 }),
    makeRecord({ sessionId: "s1", cost: 5, timestampMs: 3000 }),
    makeRecord({ sessionId: "s2", cost: 1, timestampMs: 2000 }),
  ];

  it("should sort by cost by default", () => {
    const sessions = computeSessions(records);
    expect(sessions.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
    expect(sessions[0].cost).toBeCloseTo(10, 10);
    expect(sessions[0].turns).toBe(2);
  });

  it("should sort by recency when sort=recent", () => {
    const sessions = computeSessions(records, { sort: "recent" });
    expect(sessions.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
    expect(sessions[0].lastTimestampMs).toBe(3000);
  });

  it("should respect the limit", () => {
    const sessions = computeSessions(records, { limit: 1 });
    expect(sessions.length).toBe(1);
  });
});

describe("computeModels", () => {
  it("should aggregate by model and compute cost share", () => {
    const records = [
      makeRecord({ model: "claude-opus-4-6", cost: 3, sessionId: "s1" }),
      makeRecord({ model: "claude-haiku-4-5", cost: 1, sessionId: "s2" }),
    ];
    const models = computeModels(records);

    expect(models[0].model).toBe("claude-opus-4-6");
    expect(models[0].share).toBeCloseTo(0.75, 10);
    expect(models[1].share).toBeCloseTo(0.25, 10);
    expect(models[0].sessionCount).toBe(1);
  });
});

describe("computeProjects", () => {
  it("should aggregate by project and sort by cost descending", () => {
    const records = [
      makeRecord({ project: "proj-b", cost: 1 }),
      makeRecord({ project: "proj-a", cost: 5 }),
    ];
    const projects = computeProjects(records);
    expect(projects.map((p) => p.project)).toEqual(["proj-a", "proj-b"]);
  });
});

describe("computeTimeline", () => {
  it("should group daily and sort chronologically", () => {
    const records = [
      makeRecord({ date: "2026-07-12", cost: 1 }),
      makeRecord({ date: "2026-07-10", cost: 2 }),
    ];
    const timeline = computeTimeline(records, "daily");
    expect(timeline.map((t) => t.period)).toEqual(["2026-07-10", "2026-07-12"]);
  });

  it("should group monthly", () => {
    const records = [
      makeRecord({ date: "2026-07-10", cost: 1 }),
      makeRecord({ date: "2026-07-25", cost: 2 }),
      makeRecord({ date: "2026-08-01", cost: 3 }),
    ];
    const timeline = computeTimeline(records, "monthly");
    expect(timeline.map((t) => t.period)).toEqual(["2026-07", "2026-08"]);
    expect(timeline[0].cost).toBeCloseTo(3, 10);
  });
});

describe("computeHeatmap", () => {
  it("should return a zero-filled cell for every day in the window", () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    const records = [makeRecord({ date: "2026-07-10", cost: 5 })];

    const cells = computeHeatmap(records, 3, now);
    expect(cells.length).toBe(3);
    expect(cells.map((c) => c.date)).toEqual(["2026-07-08", "2026-07-09", "2026-07-10"]);
    expect(cells[2].cost).toBeCloseTo(5, 10);
    expect(cells[0].cost).toBe(0);
  });
});

describe("getAggregatedUsage (backward-compat)", () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCache();
  });

  it("should return a zeroed structure when there is no usage data", async () => {
    mockReaddir.mockResolvedValueOnce([] as any);
    const result = await getAggregatedUsage();

    expect(result.overview).toEqual({
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      sessionCount: 0,
    });
    expect(result.byModel).toEqual({});
    expect(result.byProject).toEqual({});
    expect(result.byDay).toEqual({});
  });

  it("should expose byModel/byProject/byDay keyed maps", async () => {
    mockSingleFileTree();
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    mockReadFile.mockResolvedValue(sampleTranscriptContent);

    const result = await getAggregatedUsage();

    expect(Object.keys(result.byModel).length).toBeGreaterThan(0);
    for (const model of Object.values(result.byModel)) {
      expect(model).toHaveProperty("model");
      expect(model).toHaveProperty("cost");
      expect(model).toHaveProperty("inputTokens");
      expect(model).toHaveProperty("outputTokens");
      expect(model).toHaveProperty("sessionCount");
    }
    for (const project of Object.values(result.byProject)) {
      expect(project).toHaveProperty("project");
      expect(project).toHaveProperty("sessionCount");
    }
    for (const day of Object.values(result.byDay)) {
      expect(day).toHaveProperty("date");
      expect(day).toHaveProperty("sessionCount");
    }
  });
});
