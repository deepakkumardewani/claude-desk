import { useMemo, useState } from "react";
import { InstalledTable } from "../components/discover/InstalledTable";
import { RepoExplorer, type ExploreRequest } from "../components/discover/RepoExplorer";
import { SkillsShSearch } from "../components/discover/SkillsShSearch";
import { InstallsProvider } from "../lib/installs";
import { useWorkspace } from "../lib/scope";
import type { InstallTarget } from "schema";

type TabId = "skills-sh" | "github" | "installed";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "skills-sh", label: "skills.sh" },
  { id: "github", label: "GitHub repo" },
  { id: "installed", label: "Installed" },
];

export function Discover() {
  const { workspace } = useWorkspace();
  // Stable identity so badges only recompute when the active scope really changes.
  const dir = workspace.kind === "project" ? workspace.dir : undefined;
  const target = useMemo<InstallTarget>(
    () => (dir === undefined ? { scope: "user" } : { scope: "project", projectDir: dir }),
    [dir],
  );

  return (
    <InstallsProvider target={target}>
      <DiscoverTabs />
    </InstallsProvider>
  );
}

function DiscoverTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("github");
  const [exploreRequest, setExploreRequest] = useState<ExploreRequest>();

  function openInGithubExplorer(source: string) {
    setExploreRequest((previous) => ({ input: source, nonce: (previous?.nonce ?? 0) + 1 }));
    setActiveTab("github");
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text">Discover</h1>
        <p className="text-sm text-text-muted">
          Browse skills, agents, commands, hooks and more from the community.
        </p>
      </div>

      <div role="tablist" aria-label="Discover sections" className="inline-flex gap-0.5">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`discover-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`discover-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
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

      {/* Every panel stays mounted (hidden, not unmounted) so a tab keeps its own state across switches. */}
      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`discover-panel-${tab.id}`}
          aria-labelledby={`discover-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          {tab.id === "github" ? <RepoExplorer request={exploreRequest} /> : null}
          {tab.id === "skills-sh" ? <SkillsShSearch onOpenRepo={openInGithubExplorer} /> : null}
          {tab.id === "installed" ? <InstalledTable /> : null}
        </div>
      ))}
    </div>
  );
}
