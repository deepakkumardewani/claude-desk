import { describe, it, expect, vi } from "vite-plus/test";
import {
  getUsageOverviewResponse,
  getUsageModelsResponse,
  getUsageProjectsResponse,
  getUsageTimelineResponse,
} from "./usage.js";

// Mock the aggregator
vi.mock("../usage/aggregate.js", () => {
  const mockAggregation = {
    overview: {
      totalCost: 10.5,
      totalInputTokens: 100000,
      totalOutputTokens: 5000,
      sessionCount: 50,
    },
    byModel: {
      "claude-opus-4-1": {
        model: "claude-opus-4-1",
        cost: 8.0,
        inputTokens: 80000,
        outputTokens: 4000,
        sessionCount: 40,
      },
      "claude-haiku-4-5": {
        model: "claude-haiku-4-5",
        cost: 2.5,
        inputTokens: 20000,
        outputTokens: 1000,
        sessionCount: 10,
      },
    },
    byProject: {
      "react/cc-studio": {
        project: "react/cc-studio",
        cost: 6.0,
        inputTokens: 60000,
        outputTokens: 3000,
        sessionCount: 30,
      },
      "react/weavr": {
        project: "react/weavr",
        cost: 4.5,
        inputTokens: 40000,
        outputTokens: 2000,
        sessionCount: 20,
      },
    },
    byDay: {
      "2026-07-14": {
        date: "2026-07-14",
        cost: 5.0,
        inputTokens: 50000,
        outputTokens: 2500,
        sessionCount: 25,
      },
      "2026-07-15": {
        date: "2026-07-15",
        cost: 5.5,
        inputTokens: 50000,
        outputTokens: 2500,
        sessionCount: 25,
      },
    },
  };

  return {
    getAggregatedUsage: vi.fn().mockResolvedValue(mockAggregation),
  };
});

describe("Usage API Routes", () => {
  describe("getUsageOverviewResponse", () => {
    it("should return overview statistics", async () => {
      const result = await getUsageOverviewResponse();

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("totalCost");
      expect(result.body).toHaveProperty("totalInputTokens");
      expect(result.body).toHaveProperty("totalOutputTokens");
      expect(result.body).toHaveProperty("sessionCount");

      if (result.status === 200 && "totalCost" in result.body) {
        expect(result.body.totalCost).toBe(10.5);
        expect(result.body.sessionCount).toBe(50);
      }
    });

    it("should handle errors gracefully", async () => {
      // Mock getAggregatedUsage to throw
      const { getAggregatedUsage } = await import("../usage/aggregate.js");
      vi.mocked(getAggregatedUsage).mockRejectedValueOnce(new Error("Test error"));

      const result = await getUsageOverviewResponse();

      expect(result.status).toBe(500);
      expect(result.body).toHaveProperty("error");
    });
  });

  describe("getUsageModelsResponse", () => {
    it("should return models sorted by cost (descending)", async () => {
      const result = await getUsageModelsResponse();

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("models");

      if (result.status === 200 && "models" in result.body) {
        const models = result.body.models;
        expect(models.length).toBe(2);
        expect(models[0].model).toBe("claude-opus-4-1");
        expect(models[0].cost).toBe(8.0);
        expect(models[1].model).toBe("claude-haiku-4-5");
      }
    });

    it("should handle empty model list", async () => {
      const { getAggregatedUsage } = await import("../usage/aggregate.js");
      vi.mocked(getAggregatedUsage).mockResolvedValueOnce({
        overview: { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, sessionCount: 0 },
        byModel: {},
        byProject: {},
        byDay: {},
      } as any);

      const result = await getUsageModelsResponse();

      expect(result.status).toBe(200);
      if (result.status === 200 && "models" in result.body) {
        expect(result.body.models).toEqual([]);
      }
    });
  });

  describe("getUsageProjectsResponse", () => {
    it("should return projects sorted by cost (descending)", async () => {
      const result = await getUsageProjectsResponse();

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("projects");

      if (result.status === 200 && "projects" in result.body) {
        const projects = result.body.projects;
        expect(projects.length).toBe(2);
        expect(projects[0].project).toBe("react/cc-studio");
        expect(projects[0].cost).toBe(6.0);
        expect(projects[1].project).toBe("react/weavr");
      }
    });

    it("should handle empty project list", async () => {
      const { getAggregatedUsage } = await import("../usage/aggregate.js");
      vi.mocked(getAggregatedUsage).mockResolvedValueOnce({
        overview: { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, sessionCount: 0 },
        byModel: {},
        byProject: {},
        byDay: {},
      } as any);

      const result = await getUsageProjectsResponse();

      expect(result.status).toBe(200);
      if (result.status === 200 && "projects" in result.body) {
        expect(result.body.projects).toEqual([]);
      }
    });
  });

  describe("getUsageTimelineResponse", () => {
    it("should return timeline sorted chronologically", async () => {
      const result = await getUsageTimelineResponse();

      expect(result.status).toBe(200);
      expect(result.body).toHaveProperty("timeline");

      if (result.status === 200 && "timeline" in result.body) {
        const timeline = result.body.timeline;
        expect(timeline.length).toBe(2);
        expect(timeline[0].date).toBe("2026-07-14");
        expect(timeline[1].date).toBe("2026-07-15");
        expect(timeline[0].cost).toBe(5.0);
        expect(timeline[1].cost).toBe(5.5);
      }
    });

    it("should handle empty timeline", async () => {
      const { getAggregatedUsage } = await import("../usage/aggregate.js");
      vi.mocked(getAggregatedUsage).mockResolvedValueOnce({
        overview: { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, sessionCount: 0 },
        byModel: {},
        byProject: {},
        byDay: {},
      } as any);

      const result = await getUsageTimelineResponse();

      expect(result.status).toBe(200);
      if (result.status === 200 && "timeline" in result.body) {
        expect(result.body.timeline).toEqual([]);
      }
    });

    it("should handle reverse-chronological data", async () => {
      const { getAggregatedUsage } = await import("../usage/aggregate.js");
      vi.mocked(getAggregatedUsage).mockResolvedValueOnce({
        overview: { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, sessionCount: 0 },
        byModel: {},
        byProject: {},
        byDay: {
          "2026-07-16": {
            date: "2026-07-16",
            cost: 3.0,
            inputTokens: 30000,
            outputTokens: 1500,
            sessionCount: 15,
          },
          "2026-07-14": {
            date: "2026-07-14",
            cost: 5.0,
            inputTokens: 50000,
            outputTokens: 2500,
            sessionCount: 25,
          },
        },
      } as any);

      const result = await getUsageTimelineResponse();

      if (result.status === 200 && "timeline" in result.body) {
        const timeline = result.body.timeline;
        expect(timeline[0].date).toBe("2026-07-14");
        expect(timeline[1].date).toBe("2026-07-16");
      }
    });
  });

  describe("Error handling", () => {
    it("should return 500 on aggregation error", async () => {
      const { getAggregatedUsage } = await import("../usage/aggregate.js");
      const errorMsg = "Database connection failed";
      vi.mocked(getAggregatedUsage).mockRejectedValueOnce(new Error(errorMsg));

      const result = await getUsageOverviewResponse();

      expect(result.status).toBe(500);
      if (result.status === 500 && "error" in result.body) {
        expect(result.body.error).toContain(errorMsg);
      }
    });
  });
});
