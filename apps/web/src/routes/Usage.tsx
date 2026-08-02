import { useState, useEffect } from "react";
import { MetricTile } from "../components/charts/MetricTile";
import { CostBars } from "../components/charts/CostBars";
import { ModelSplit } from "../components/charts/ModelSplit";
import { Heatmap } from "../components/charts/Heatmap";
import {
  fetchUsageOverview,
  fetchUsageModels,
  fetchUsageProjects,
  fetchUsageTimeline,
  type UsageOverview,
  type UsageModelsResponse,
  type UsageProjectsResponse,
  type UsageTimelineResponse,
} from "../lib/api";

type Tab = "overview" | "models" | "projects" | "timeline";

interface CachedData {
  overview: UsageOverview | null;
  models: UsageModelsResponse | null;
  projects: UsageProjectsResponse | null;
  timeline: UsageTimelineResponse | null;
}

// Context cache to avoid refetch on revisit
const usageCache: CachedData = {
  overview: null,
  models: null,
  projects: null,
  timeline: null,
};

export function Usage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [data, setData] = useState<CachedData>(usageCache);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (usageCache.overview && usageCache.models && usageCache.projects && usageCache.timeline) {
        // All data cached
        setData(usageCache);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [overview, models, projects, timeline] = await Promise.all([
          usageCache.overview || fetchUsageOverview(),
          usageCache.models || fetchUsageModels(),
          usageCache.projects || fetchUsageProjects(),
          usageCache.timeline || fetchUsageTimeline(),
        ]);

        usageCache.overview = overview;
        usageCache.models = models;
        usageCache.projects = projects;
        usageCache.timeline = timeline;

        setData({ overview, models, projects, timeline });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load usage data";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  if (loading && !data.overview) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-blue-500" />
          <p className="text-text-muted">Loading usage data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
        <p className="font-medium">Error loading usage data</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const overview = data.overview;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
          Usage Analytics
        </h1>
        <p className="text-sm text-text-muted">
          Track your Claude API usage and costs across models and projects.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border-subtle">
        <div className="flex gap-8">
          {(["overview", "models", "projects", "timeline"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-1 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "border-b-2 border-blue-500 text-text"
                  : "border-b-2 border-transparent text-text-muted hover:text-text"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {/* Overview Tab */}
        {activeTab === "overview" && overview && (
          <div className="space-y-6">
            {/* Summary Tiles */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                label="Total Cost"
                value={`$${overview.totalCost.toFixed(2)}`}
                color="blue"
              />
              <MetricTile label="Sessions" value={overview.sessionCount} color="green" />
              <MetricTile
                label="Input Tokens"
                value={(overview.totalInputTokens / 1_000_000).toFixed(2)}
                unit="M"
                color="orange"
              />
              <MetricTile
                label="Output Tokens"
                value={(overview.totalOutputTokens / 1_000_000).toFixed(2)}
                unit="M"
                color="purple"
              />
            </div>

            {/* Charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              {data.models && data.models.models.length > 0 && (
                <div className="rounded-lg border border-border-subtle bg-surface-raised p-6">
                  <ModelSplit
                    data={data.models.models.map((m) => ({
                      label: m.model.replace(/^claude-/, ""),
                      cost: m.cost,
                    }))}
                    title="Cost by Model"
                  />
                </div>
              )}

              {data.projects && data.projects.projects.length > 0 && (
                <div className="rounded-lg border border-border-subtle bg-surface-raised p-6">
                  <CostBars
                    data={data.projects.projects.map((p) => ({
                      label: p.project,
                      cost: p.cost,
                    }))}
                    title="Cost by Project"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Models Tab */}
        {activeTab === "models" && data.models && (
          <div className="space-y-6">
            {data.models.models.length === 0 ? (
              <div className="rounded-lg border border-border-subtle bg-surface-raised p-8 text-center">
                <p className="text-text-muted">No model usage data available</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border-subtle bg-surface-raised p-6">
                <CostBars
                  data={data.models.models.map((m) => ({
                    label: m.model,
                    cost: m.cost,
                  }))}
                  title="Usage by Model"
                />
              </div>
            )}

            {/* Detailed Table */}
            {data.models.models.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-soft">
                      <th className="px-4 py-2 text-left font-semibold text-text">Model</th>
                      <th className="px-4 py-2 text-right font-semibold text-text">Cost</th>
                      <th className="px-4 py-2 text-right font-semibold text-text">Input Tokens</th>
                      <th className="px-4 py-2 text-right font-semibold text-text">
                        Output Tokens
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-text">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.models.models.map((model) => (
                      <tr key={model.model} className="border-b border-border-subtle">
                        <td className="px-4 py-2 text-text">{model.model}</td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          ${model.cost.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          {(model.inputTokens / 1_000_000).toFixed(2)}M
                        </td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          {(model.outputTokens / 1_000_000).toFixed(2)}M
                        </td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          {model.sessionCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Projects Tab */}
        {activeTab === "projects" && data.projects && (
          <div className="space-y-6">
            {data.projects.projects.length === 0 ? (
              <div className="rounded-lg border border-border-subtle bg-surface-raised p-8 text-center">
                <p className="text-text-muted">No project usage data available</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border-subtle bg-surface-raised p-6">
                <CostBars
                  data={data.projects.projects.map((p) => ({
                    label: p.project,
                    cost: p.cost,
                  }))}
                  title="Usage by Project"
                />
              </div>
            )}

            {/* Detailed Table */}
            {data.projects.projects.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-soft">
                      <th className="px-4 py-2 text-left font-semibold text-text">Project</th>
                      <th className="px-4 py-2 text-right font-semibold text-text">Cost</th>
                      <th className="px-4 py-2 text-right font-semibold text-text">Input Tokens</th>
                      <th className="px-4 py-2 text-right font-semibold text-text">
                        Output Tokens
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-text">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.projects.map((project) => (
                      <tr key={project.project} className="border-b border-border-subtle">
                        <td className="px-4 py-2 text-text">{project.project}</td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          ${project.cost.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          {(project.inputTokens / 1_000_000).toFixed(2)}M
                        </td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          {(project.outputTokens / 1_000_000).toFixed(2)}M
                        </td>
                        <td className="px-4 py-2 text-right text-text-muted">
                          {project.sessionCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === "timeline" && data.timeline && (
          <div className="space-y-6">
            {data.timeline.timeline.length === 0 ? (
              <div className="rounded-lg border border-border-subtle bg-surface-raised p-8 text-center">
                <p className="text-text-muted">No timeline data available</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border-subtle bg-surface-raised p-6">
                  <Heatmap
                    data={data.timeline.timeline.map((d) => ({
                      date: d.date,
                      value: d.cost,
                    }))}
                    title="Daily Cost Heatmap"
                    unit="USD"
                  />
                </div>

                {/* Timeline Chart */}
                <div className="rounded-lg border border-border-subtle bg-surface-raised p-6">
                  <h3 className="mb-4 text-sm font-semibold text-text">Daily Breakdown</h3>
                  <div className="space-y-2">
                    {data.timeline.timeline.map((entry) => (
                      <div key={entry.date} className="flex items-center justify-between">
                        <span className="text-sm text-text-muted">{entry.date}</span>
                        <div className="flex gap-4">
                          <span className="w-24 text-right text-sm font-medium text-text">
                            ${entry.cost.toFixed(2)}
                          </span>
                          <span className="text-sm text-text-muted">
                            {entry.sessionCount} sessions
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
