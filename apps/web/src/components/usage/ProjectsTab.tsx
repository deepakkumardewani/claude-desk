import { useEffect, useState } from "react";
import { fetchUsageProjects, type UsageProjectsResponse } from "../../lib/api";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlocks";
import { MiniShareBar } from "./MiniShareBar";
import { formatCost, formatTokens, shareOf } from "./format";
import { PERIOD_OPTIONS, PERIOD_SELECT_CLASS, periodLabel } from "./period";
import {
  TABLE_WRAP,
  TABLE,
  THEAD_ROW,
  TH,
  TH_RIGHT,
  TR,
  TD,
  TD_NUM,
  TD_NUM_STRONG,
  TD_TRUNCATE,
} from "./table";

const projectsCache = new Map<string, UsageProjectsResponse>();

export function ProjectsTab() {
  const [period, setPeriod] = useState("");
  const [data, setData] = useState<UsageProjectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = period || "all";
    const cached = projectsCache.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchUsageProjects({ period: period || undefined })
      .then((response) => {
        if (cancelled) return;
        projectsCache.set(key, response);
        setData(response);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load project usage");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  const projects = data?.projects ?? [];
  const totalCost = projects.reduce((sum, p) => sum + p.cost, 0);
  const sorted = [...projects].sort((a, b) => b.cost - a.cost);

  return (
    <div className="space-y-4">
      <label className="flex w-fit flex-col gap-1 text-xs font-medium text-text-muted">
        Period
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className={PERIOD_SELECT_CLASS}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {loading && <LoadingBlock label="Loading project usage..." />}
      {!loading && error && <ErrorBlock message={error} />}
      {!loading && !error && projects.length === 0 && (
        <EmptyBlock message="No project usage data available" />
      )}

      {!loading && !error && projects.length > 0 && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">Cost by Project</h3>
            <p className="text-xs text-text-muted">
              <span className="font-mono tabular-nums text-text">{projects.length}</span> projects ·{" "}
              <span className="font-mono tabular-nums text-teal-700 dark:text-teal-300">
                {formatCost(totalCost)}
              </span>
              <span> · {periodLabel(period)}</span>
            </p>
          </div>

          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr className={THEAD_ROW}>
                  <th className={TH}>Project</th>
                  <th className={TH_RIGHT}>Sessions</th>
                  <th className={TH_RIGHT}>Input</th>
                  <th className={TH_RIGHT}>Output</th>
                  <th className={TH_RIGHT}>Share</th>
                  <th className={TH_RIGHT}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((project) => (
                  <tr key={project.project} className={TR}>
                    <td className={TD}>
                      <span className={TD_TRUNCATE} title={project.project}>
                        {project.project}
                      </span>
                    </td>
                    <td className={TD_NUM}>{project.sessionCount}</td>
                    <td className={TD_NUM}>{formatTokens(project.inputTokens)}</td>
                    <td className={TD_NUM}>{formatTokens(project.outputTokens)}</td>
                    <td className="px-4 py-2.5">
                      <MiniShareBar pct={shareOf(project.cost, totalCost)} />
                    </td>
                    <td className={TD_NUM_STRONG}>{formatCost(project.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
