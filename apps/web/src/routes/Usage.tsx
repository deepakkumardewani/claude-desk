import { useEffect, useState } from "react";
import { OverviewTab } from "../components/usage/OverviewTab";
import { TimelineTab } from "../components/usage/TimelineTab";
import { ModelsTab } from "../components/usage/ModelsTab";
import { ProjectsTab } from "../components/usage/ProjectsTab";
import { SessionsTab } from "../components/usage/SessionsTab";
import { WindowsTab } from "../components/usage/WindowsTab";
import { PromptsTab } from "../components/usage/PromptsTab";
import {
  fetchOverviewCached,
  getCachedOverview,
  POLL_MS,
  subscribeOverview,
} from "../components/usage/overviewStore";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "models", label: "Models" },
  { id: "projects", label: "Projects" },
  { id: "sessions", label: "Sessions" },
  { id: "windows", label: "Windows" },
  { id: "prompts", label: "Prompts" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_COMPONENTS: Record<TabId, () => React.JSX.Element> = {
  overview: OverviewTab,
  timeline: TimelineTab,
  models: ModelsTab,
  projects: ProjectsTab,
  sessions: SessionsTab,
  windows: WindowsTab,
  prompts: PromptsTab,
};

export function Usage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [pricingAsOf, setPricingAsOf] = useState<string | undefined>(
    getCachedOverview()?.pricingAsOf,
  );

  useEffect(() => {
    const unsubscribe = subscribeOverview((overview) => {
      setPricingAsOf(overview.pricingAsOf);
    });

    fetchOverviewCached().catch(() => {
      // OverviewTab surfaces the error; the shell note is non-critical.
    });

    const intervalId = setInterval(() => {
      fetchOverviewCached({ force: true }).catch(() => {
        // Keep last cache; OverviewTab already showed a load error if needed.
      });
    }, POLL_MS);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  const ActiveTabComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
          Usage Analytics
        </h1>
        <p className="text-sm text-text-muted">
          Track your Claude API usage and costs across models and projects.
        </p>
        <p className="text-xs text-text-muted">
          Estimated from local logs · Anthropic rates
          {pricingAsOf ? ` · pricing as of ${pricingAsOf}` : ""}
        </p>
      </div>

      {/* Tab Navigation — compact chips; no full-bleed track */}
      <div
        role="tablist"
        aria-label="Usage Analytics sections"
        className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto"
      >
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`usage-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`usage-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-[13px] font-medium transition-[color,background-color,box-shadow] duration-150 ${
                selected
                  ? "bg-surface-raised text-text shadow-sm ring-1 ring-border-subtle"
                  : "text-text-muted hover:bg-surface-soft hover:text-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <div
        role="tabpanel"
        id={`usage-panel-${activeTab}`}
        aria-labelledby={`usage-tab-${activeTab}`}
      >
        <ActiveTabComponent />
      </div>
    </div>
  );
}
