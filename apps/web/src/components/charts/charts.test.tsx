// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vite-plus/test";
import { MetricTile } from "./MetricTile";
import { CostBars } from "./CostBars";
import { ModelSplit } from "./ModelSplit";
import { Heatmap } from "./Heatmap";

afterEach(cleanup);

describe("Chart Components", () => {
  describe("MetricTile", () => {
    it("should render with basic props", () => {
      const { container } = render(<MetricTile label="Total Cost" value="$123.45" unit="USD" />);
      expect(container.textContent).toContain("Total Cost");
      expect(container.textContent).toContain("$123.45");
      expect(container.textContent).toContain("USD");
    });

    it("should render with trend information", () => {
      const { container } = render(
        <MetricTile
          label="Monthly Cost"
          value={500}
          color="orange"
          trend={{ direction: "up", percent: 5.2 }}
        />,
      );
      expect(container.textContent).toContain("Monthly Cost");
      expect(container.textContent).toContain("500");
      expect(container.textContent).toContain("5.2%");
    });

    it("should support different color variants", () => {
      const colors: Array<"blue" | "green" | "orange" | "purple"> = [
        "blue",
        "green",
        "orange",
        "purple",
      ];
      for (const color of colors) {
        const { container } = render(<MetricTile label="Test" value={100} color={color} />);
        expect(container).toBeTruthy();
      }
    });
  });

  describe("CostBars", () => {
    it("should render bar chart with data", () => {
      const data = [
        { label: "Claude Opus", cost: 8.5 },
        { label: "Claude Sonnet", cost: 2.3 },
        { label: "Claude Haiku", cost: 0.8 },
      ];
      const { container } = render(<CostBars data={data} title="Cost by Model" />);
      expect(container.textContent).toContain("Cost by Model");
      expect(container.textContent).toContain("Claude Opus");
      expect(container.textContent).toContain("Claude Sonnet");
      expect(container.textContent).toContain("Claude Haiku");
    });

    it("should render empty bar chart", () => {
      const { container } = render(<CostBars data={[]} />);
      expect(container).toBeTruthy();
    });

    it("should sort bars by cost descending", () => {
      const data = [
        { label: "Low", cost: 1.0 },
        { label: "High", cost: 100.0 },
        { label: "Mid", cost: 50.0 },
      ];
      const { container } = render(<CostBars data={data} />);
      const text = container.textContent || "";
      // High should appear before Low in the rendered output
      expect(text.indexOf("High")).toBeLessThan(text.indexOf("Low"));
    });
  });

  describe("ModelSplit", () => {
    it("should render pie chart", () => {
      const data = [
        { label: "Claude Opus", cost: 8.5 },
        { label: "Claude Sonnet", cost: 2.3 },
      ];
      const { container } = render(<ModelSplit data={data} variant="pie" />);
      expect(container.textContent).toContain("Claude Opus");
      expect(container.textContent).toContain("Claude Sonnet");
      // Should show percentages
      expect(container.textContent).toMatch(/\d+\.\d+%/);
    });

    it("should render donut chart", () => {
      const data = [
        { label: "Model A", cost: 5.0 },
        { label: "Model B", cost: 5.0 },
      ];
      const { container } = render(<ModelSplit data={data} variant="donut" />);
      expect(container.textContent).toContain("Model A");
      expect(container.textContent).toContain("Model B");
    });

    it("should handle empty data", () => {
      const { container } = render(<ModelSplit data={[]} />);
      expect(container.textContent).toContain("No data available");
    });

    it("should calculate percentages correctly", () => {
      const data = [
        { label: "50%", cost: 100.0 },
        { label: "50%", cost: 100.0 },
      ];
      const { container } = render(<ModelSplit data={data} />);
      expect(container.textContent).toContain("50.0%");
    });
  });

  describe("Heatmap", () => {
    it("should render heatmap with data", () => {
      const data = [
        { date: "2026-07-14", value: 5.0 },
        { date: "2026-07-15", value: 10.0 },
        { date: "2026-07-16", value: 3.5 },
      ];
      const { container } = render(<Heatmap data={data} title="Daily Activity" unit="USD" />);
      expect(container.textContent).toContain("Daily Activity");
      expect(container.querySelector("svg")).toBeTruthy();
    });

    it("should render day labels", () => {
      const data = [{ date: "2026-07-14", value: 5.0 }];
      const { container } = render(<Heatmap data={data} />);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (const day of days) {
        expect(container.textContent).toContain(day);
      }
    });

    it("should handle empty data", () => {
      const { container } = render(<Heatmap data={[]} />);
      expect(container.textContent).toContain("No data available");
    });

    it("should render legend", () => {
      const data = [
        { date: "2026-07-14", value: 5.0 },
        { date: "2026-07-15", value: 10.0 },
      ];
      const { container } = render(<Heatmap data={data} />);
      expect(container.textContent).toContain("Less");
      expect(container.textContent).toContain("More");
    });

    it("should generate tooltips for cells", () => {
      const data = [{ date: "2026-07-14", value: 5.5 }];
      const { container } = render(<Heatmap data={data} unit="USD" />);
      const svgElement = container.querySelector("svg");
      expect(svgElement).toBeTruthy();
      // Check for title elements (SVG tooltips)
      const titles = svgElement?.querySelectorAll("title");
      expect(titles && titles.length > 0).toBeTruthy();
    });
  });
});
