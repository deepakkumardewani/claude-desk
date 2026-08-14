import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import type { UsageRecord } from "../usage/parser.js";
import { loadAllRecords, computePrompts } from "../usage/aggregate.js";
import {
  getUsageOverviewResponse,
  getUsageModelsResponse,
  getUsageProjectsResponse,
  getUsageTimelineResponse,
  getUsageSessionsResponse,
  getUsageWindowsResponse,
  getUsagePromptsResponse,
} from "./usage.js";

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  const now = Date.now();
  return {
    model: "claude-opus-4-1",
    project: "react/cc-studio",
    date: new Date(now).toISOString().slice(0, 10),
    timestampMs: now,
    sessionId: "session-1",
    dedupeKey: undefined,
    inputTokens: 1000,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 1,
    ...overrides,
  };
}

const sampleRecords: UsageRecord[] = [
  makeRecord({ model: "claude-opus-4-1", project: "react/cc-studio", sessionId: "s1", cost: 8.0 }),
  makeRecord({ model: "claude-haiku-4-5", project: "react/weavr", sessionId: "s2", cost: 2.5 }),
];

// Mock only the I/O-dependent entry points; real (pure) aggregation logic still runs,
// so these tests exercise the actual compute* functions against canned records.
vi.mock("../usage/aggregate.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../usage/aggregate.js")>();
  return {
    ...actual,
    loadAllRecords: vi.fn().mockResolvedValue([]),
    computePrompts: vi.fn().mockResolvedValue([]),
  };
});

const mockLoadAllRecords = vi.mocked(loadAllRecords);
const mockComputePrompts = vi.mocked(computePrompts);

describe("Usage API Routes", () => {
  beforeEach(() => {
    mockLoadAllRecords.mockReset().mockResolvedValue(sampleRecords);
    mockComputePrompts.mockReset().mockResolvedValue([]);
  });

  describe("getUsageOverviewResponse", () => {
    it("should return totals, today, activeWindow, heatmap and pricingAsOf", async () => {
      const result = await getUsageOverviewResponse();

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("totals");
      expect(result.body).toHaveProperty("today");
      expect(result.body).toHaveProperty("activeWindow");
      expect(result.body).toHaveProperty("heatmap");
      expect(result.body).toHaveProperty("pricingAsOf");

      if (result.status === 200) {
        expect(result.body.totals.cost).toBeCloseTo(10.5, 10);
        expect(result.body.totals.sessionCount).toBe(2);
        expect(result.body.heatmap.length).toBe(84);
        expect(typeof result.body.pricingAsOf).toBe("string");
      }
    });

    it("should handle errors gracefully", async () => {
      mockLoadAllRecords.mockRejectedValueOnce(new Error("Test error"));

      const result = await getUsageOverviewResponse();

      expect(result.status).toBe(500);
      expect(result.body).toHaveProperty("error");
    });
  });

  describe("getUsageModelsResponse", () => {
    it("should return models sorted by cost (descending)", async () => {
      const result = await getUsageModelsResponse({});

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("models");

      if (result.status === 200) {
        const models = result.body.models;
        expect(models.length).toBe(2);
        expect(models[0].model).toBe("claude-opus-4-1");
        expect(models[0].cost).toBeCloseTo(8.0, 10);
        expect(models[1].model).toBe("claude-haiku-4-5");
      }
    });

    it("should handle an empty model list", async () => {
      mockLoadAllRecords.mockResolvedValueOnce([]);

      const result = await getUsageModelsResponse({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.models).toEqual([]);
      }
    });
  });

  describe("getUsageProjectsResponse", () => {
    it("should return projects sorted by cost (descending)", async () => {
      const result = await getUsageProjectsResponse({});

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("projects");

      if (result.status === 200) {
        const projects = result.body.projects;
        expect(projects.length).toBe(2);
        expect(projects[0].project).toBe("react/cc-studio");
        expect(projects[0].cost).toBeCloseTo(8.0, 10);
        expect(projects[1].project).toBe("react/weavr");
      }
    });

    it("should handle an empty project list", async () => {
      mockLoadAllRecords.mockResolvedValueOnce([]);

      const result = await getUsageProjectsResponse({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.projects).toEqual([]);
      }
    });
  });

  describe("getUsageTimelineResponse", () => {
    it("should return a daily timeline sorted chronologically by default", async () => {
      const records = [
        makeRecord({ date: "2026-07-16", cost: 3.0 }),
        makeRecord({ date: "2026-07-14", cost: 5.0 }),
      ];
      mockLoadAllRecords.mockResolvedValueOnce(records);

      const result = await getUsageTimelineResponse({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.granularity).toBe("daily");
        const timeline = result.body.timeline;
        expect(timeline.map((t) => t.period)).toEqual(["2026-07-14", "2026-07-16"]);
      }
    });

    it("should group monthly when granularity=monthly", async () => {
      const records = [
        makeRecord({ date: "2026-07-14", cost: 5.0 }),
        makeRecord({ date: "2026-08-01", cost: 3.0 }),
      ];
      mockLoadAllRecords.mockResolvedValueOnce(records);

      const result = await getUsageTimelineResponse({ granularity: "monthly" });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.granularity).toBe("monthly");
        expect(result.body.timeline.map((t) => t.period)).toEqual(["2026-07", "2026-08"]);
      }
    });

    it("should handle an empty timeline", async () => {
      mockLoadAllRecords.mockResolvedValueOnce([]);

      const result = await getUsageTimelineResponse({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.timeline).toEqual([]);
      }
    });
  });

  describe("getUsageSessionsResponse", () => {
    it("should sort sessions by cost by default", async () => {
      const result = await getUsageSessionsResponse({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.sessions.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
      }
    });

    it("should sort sessions by recency when sort=recent", async () => {
      const result = await getUsageSessionsResponse({ sort: "recent" });
      expect(result.status).toBe(200);
    });

    it("should respect the limit param", async () => {
      const result = await getUsageSessionsResponse({ limit: 1 });
      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.sessions.length).toBe(1);
      }
    });
  });

  describe("getUsageWindowsResponse", () => {
    it("should return billing windows", async () => {
      const result = await getUsageWindowsResponse();
      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("windows");
    });
  });

  describe("getUsagePromptsResponse", () => {
    it("should return prompts from computePrompts", async () => {
      mockComputePrompts.mockResolvedValueOnce([
        {
          timestampMs: 1,
          date: "2026-07-14",
          project: "p",
          sessionId: "s",
          prompt: "hi",
          cost: 0.1,
        },
      ]);

      const result = await getUsagePromptsResponse();

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.prompts.length).toBe(1);
        expect(result.body.prompts[0].prompt).toBe("hi");
      }
    });
  });

  describe("Error handling", () => {
    it("should return 500 on aggregation error", async () => {
      const errorMsg = "Database connection failed";
      mockLoadAllRecords.mockRejectedValueOnce(new Error(errorMsg));

      const result = await getUsageOverviewResponse();

      expect(result.status).toBe(500);
      if (result.status === 500) {
        expect(result.body.error).toContain(errorMsg);
      }
    });
  });
});
