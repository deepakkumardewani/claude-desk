import { useState } from "react";
import { fetchUsageModels, type UsageModelsResponse } from "../../lib/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateBlocks";
import { ShareBar } from "./ShareBar";
import { ModelPill } from "./ModelPill";
import { MiniShareBar } from "./MiniShareBar";
import { formatCost, formatTokens } from "./format";
import { PERIOD_OPTIONS, PERIOD_SELECT_CLASS, periodLabel } from "./period";
import { TABLE_WRAP, TABLE, THEAD_ROW, TH, TH_RIGHT, TR, TD, TD_NUM, TD_NUM_STRONG } from "./table";

const modelsCache = new Map<string, UsageModelsResponse>();

export function ModelsTab() {
  const [period, setPeriod] = useState("");

  const cacheKey = period || "all";
  const { data, error, loading } = useAsyncData(
    () => fetchUsageModels({ period: period || undefined }),
    [period],
    { cache: modelsCache, cacheKey },
  );

  const models = data?.models ?? [];
  const totalCost = models.reduce((sum, m) => sum + m.cost, 0);

  return (
    <div className="space-y-6">
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

      {loading && <LoadingBlock label="Loading model usage..." />}
      {!loading && error && <ErrorBlock message={error} />}
      {!loading && !error && models.length === 0 && (
        <EmptyBlock message="No model usage data available" />
      )}

      {!loading && !error && models.length > 0 && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-text-muted">
              <span className="font-mono tabular-nums text-text">{models.length}</span> models ·{" "}
              <span className="font-mono tabular-nums text-teal-700 dark:text-teal-300">
                {formatCost(totalCost)}
              </span>
              <span> · {periodLabel(period)}</span>
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-text">Cost Share</h3>
            <ShareBar items={models.map((m) => ({ label: m.model, cost: m.cost }))} />
          </div>

          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr className={THEAD_ROW}>
                  <th className={TH}>Model</th>
                  <th className={TH_RIGHT}>Sessions</th>
                  <th className={TH_RIGHT}>Input</th>
                  <th className={TH_RIGHT}>Output</th>
                  <th className={TH_RIGHT}>Share</th>
                  <th className={TH_RIGHT}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.model} className={TR}>
                    <td className={TD}>
                      <ModelPill model={model.model} />
                    </td>
                    <td className={TD_NUM}>{model.sessionCount}</td>
                    <td className={TD_NUM}>{formatTokens(model.inputTokens)}</td>
                    <td className={TD_NUM}>{formatTokens(model.outputTokens)}</td>
                    <td className="px-4 py-2.5">
                      <MiniShareBar pct={model.share * 100} />
                    </td>
                    <td className={TD_NUM_STRONG}>{formatCost(model.cost)}</td>
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
