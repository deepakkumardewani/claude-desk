// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vite-plus/test";
import { Usage } from "./Usage";

vi.mock("../lib/api", () => ({
  fetchUsageOverview: vi.fn().mockResolvedValue({
    totals: {
      cost: 10.5,
      inputTokens: 100000,
      outputTokens: 5000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      sessionCount: 50,
      projectCount: 5,
    },
    today: {
      cost: 1.5,
      inputTokens: 5000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      date: "2026-08-11",
      turns: 3,
      byModel: {
        "claude-opus-4-1": {
          cost: 1.5,
          inputTokens: 5000,
          outputTokens: 500,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          turns: 3,
        },
      },
    },
    activeWindow: null,
    heatmap: [{ date: "2026-07-14", cost: 5.0, turns: 2 }],
    pricingAsOf: "2026-08-01",
  }),
  fetchUsageModels: vi.fn().mockResolvedValue({
    models: [
      {
        model: "claude-opus-4-1",
        cost: 8.0,
        inputTokens: 80000,
        outputTokens: 4000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        sessionCount: 40,
        share: 0.7619047619047619,
      },
      {
        model: "claude-haiku-4-5",
        cost: 2.5,
        inputTokens: 20000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        sessionCount: 10,
        share: 0.23809523809523808,
      },
    ],
  }),
  fetchUsageProjects: vi.fn().mockResolvedValue({
    projects: [
      {
        project: "react/cc-studio",
        cost: 6.0,
        inputTokens: 60000,
        outputTokens: 3000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        sessionCount: 30,
      },
    ],
  }),
  fetchUsageTimeline: vi.fn().mockResolvedValue({
    granularity: "daily",
    uniqueSessionCount: 25,
    timeline: [
      {
        period: "2026-07-14",
        cost: 5.0,
        inputTokens: 50000,
        outputTokens: 2500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        sessionCount: 25,
      },
    ],
  }),
  fetchUsageSessions: vi.fn().mockResolvedValue({ sessions: [] }),
  fetchUsageWindows: vi.fn().mockResolvedValue({ windows: [] }),
  fetchUsagePrompts: vi.fn().mockResolvedValue({ prompts: [] }),
}));

afterEach(cleanup);

describe("Usage Route", () => {
  it("should render page header", async () => {
    render(<Usage />);
    await waitFor(() => {
      expect(screen.getByText("Usage Analytics")).toBeTruthy();
    });
  });

  it("should render all seven tabs", async () => {
    render(<Usage />);
    for (const label of [
      "Overview",
      "Timeline",
      "Models",
      "Projects",
      "Sessions",
      "Windows",
      "Prompts",
    ]) {
      expect(screen.getByRole("tab", { name: label })).toBeTruthy();
    }
  });

  it("should load and display overview tab by default", async () => {
    render(<Usage />);
    await waitFor(() => {
      expect(screen.getByText("Today")).toBeTruthy();
    });
  });

  it("should switch to models tab on click", async () => {
    render(<Usage />);
    fireEvent.click(screen.getByRole("tab", { name: "Models" }));

    await waitFor(() => {
      expect(screen.getAllByText("claude-opus-4-1").length).toBeGreaterThan(0);
    });
  });

  it("should switch to projects tab on click", async () => {
    render(<Usage />);
    fireEvent.click(screen.getByRole("tab", { name: "Projects" }));

    await waitFor(() => {
      expect(screen.getAllByText("react/cc-studio").length).toBeGreaterThan(0);
    });
  });

  it("should switch to windows tab on click", async () => {
    render(<Usage />);
    fireEvent.click(screen.getByRole("tab", { name: "Windows" }));

    await waitFor(() => {
      expect(screen.getByText(/No recent billing windows/)).toBeTruthy();
    });
  });

  it("should switch to prompts tab on click", async () => {
    render(<Usage />);
    fireEvent.click(screen.getByRole("tab", { name: "Prompts" }));

    await waitFor(() => {
      expect(screen.getByText(/No recent prompts available/)).toBeTruthy();
    });
  });
});
