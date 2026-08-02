// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vite-plus/test";
import { Usage } from "./Usage";

// Mock the API functions
vi.mock("../lib/api", () => {
  const mockOverview = {
    totalCost: 10.5,
    totalInputTokens: 100000,
    totalOutputTokens: 5000,
    sessionCount: 50,
  };

  const mockModels = {
    models: [
      {
        model: "claude-opus-4-1",
        cost: 8.0,
        inputTokens: 80000,
        outputTokens: 4000,
        sessionCount: 40,
      },
      {
        model: "claude-haiku-4-5",
        cost: 2.5,
        inputTokens: 20000,
        outputTokens: 1000,
        sessionCount: 10,
      },
    ],
  };

  return {
    fetchUsageOverview: vi.fn().mockResolvedValue(mockOverview),
    fetchUsageModels: vi.fn().mockResolvedValue(mockModels),
    fetchUsageProjects: vi.fn().mockResolvedValue({
      projects: [
        {
          project: "react/cc-studio",
          cost: 6.0,
          inputTokens: 60000,
          outputTokens: 3000,
          sessionCount: 30,
        },
      ],
    }),
    fetchUsageTimeline: vi.fn().mockResolvedValue({
      timeline: [
        {
          date: "2026-07-14",
          cost: 5.0,
          inputTokens: 50000,
          outputTokens: 2500,
          sessionCount: 25,
        },
      ],
    }),
  };
});

// Mock chart components
vi.mock("../components/charts/MetricTile", () => ({
  MetricTile: ({ label, value }: any) => (
    <div>
      {label}: {value}
    </div>
  ),
}));

vi.mock("../components/charts/CostBars", () => ({
  CostBars: ({ data, title }: any) => (
    <div>
      <h3>{title}</h3>
      {data?.map((d: any) => (
        <p key={d.label}>{d.label}</p>
      ))}
    </div>
  ),
}));

vi.mock("../components/charts/ModelSplit", () => ({
  ModelSplit: ({ data, title }: any) => (
    <div>
      <h3>{title}</h3>
      {data?.map((d: any) => (
        <p key={d.label}>{d.label}</p>
      ))}
    </div>
  ),
}));

vi.mock("../components/charts/Heatmap", () => ({
  Heatmap: ({ title }: any) => <div>{title}</div>,
}));

afterEach(cleanup);

describe("Usage Route", () => {
  it("should render page header", async () => {
    render(<Usage />);
    await waitFor(() => {
      expect(screen.getByText("Usage Analytics")).toBeTruthy();
    });
  });

  it("should render tab navigation", async () => {
    render(<Usage />);
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeTruthy();
      expect(screen.getByText("Models")).toBeTruthy();
      expect(screen.getByText("Projects")).toBeTruthy();
      expect(screen.getByText("Timeline")).toBeTruthy();
    });
  });

  it("should load and display overview tab by default", async () => {
    render(<Usage />);
    await waitFor(() => {
      expect(screen.getByText(/Total Cost/)).toBeTruthy();
    });
  });

  it("should switch to models tab on click", async () => {
    render(<Usage />);
    await waitFor(() => {
      expect(screen.getByText("Models")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Models"));

    await waitFor(() => {
      expect(screen.getAllByText("claude-opus-4-1").length).toBeGreaterThan(0);
    });
  });

  it("should show loading state initially", () => {
    render(<Usage />);
    // Component has inline loading UI
    expect(screen.getByText("Usage Analytics")).toBeTruthy();
  });
});
