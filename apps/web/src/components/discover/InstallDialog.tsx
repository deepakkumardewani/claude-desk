import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { DiscoveredItem, InstallPlan, InstallTarget, RepoRef } from "schema";
import {
  applyPlan,
  fetchPlan,
  type ApplyResponse,
  type ConflictResolution,
  type DiscoverApiError,
  type PlanRequest,
} from "../../lib/discoverApi";
import { useWorkspace } from "../../lib/scope";
import { workspaceBasePath, type Workspace } from "../../lib/workspaceState";
import { Modal } from "../Modal";
import {
  PlanPreview,
  scopeRelativePath,
  unresolvedConflicts,
  type ResolutionMap,
} from "./PlanPreview";
import { hasDanger, TrustPanel } from "./TrustPanel";

type Step = "target" | "changes" | "trust" | "result";

const STEP_LABELS: Record<Step, string> = {
  target: "1. Target",
  changes: "2. Changes",
  trust: "3. Trust review",
  result: "4. Result",
};

const STEP_ORDER: Step[] = ["target", "changes", "trust", "result"];
/** An update re-plans an existing install in place, so there is no target to pick. */
const UPDATE_STEP_ORDER: Step[] = ["changes", "trust", "result"];

const KIND_DIRECTORY: Partial<Record<DiscoveredItem["kind"], string>> = {
  skill: "skills",
  agent: "agents",
  command: "commands",
};

const buttonBase =
  "rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";
const primaryButton = `${buttonBase} bg-accent text-accent-fg hover:opacity-90`;
const secondaryButton = `${buttonBase} bg-surface text-text ring-1 ring-border-subtle hover:bg-surface-soft`;

export type InstallDialogProps = {
  repo: Pick<RepoRef, "owner" | "repo" | "sha" | "subpath">;
  items: DiscoveredItem[];
  onClose: () => void;
  /** Manifest id of the install to update; skips the target step and sends `update` to the API. */
  update?: string;
  /** skills.sh id recorded on the install so skills.sh cards can recognise it. */
  skillsShId?: string;
};

function workspaceTarget(workspace: Workspace): InstallTarget {
  return workspace.kind === "user"
    ? { scope: "user" }
    : { scope: "project", projectDir: workspace.dir };
}

const sameTarget = (a: InstallTarget, b: InstallTarget) =>
  a.scope === b.scope && a.projectDir === b.projectDir;

function TargetStep({
  target,
  onChange,
}: {
  target: InstallTarget;
  onChange: (target: InstallTarget) => void;
}) {
  const { projects } = useWorkspace();
  const options: Array<{ label: string; detail: string; target: InstallTarget }> = [
    { label: "User", detail: "Machine-wide ~/.claude", target: { scope: "user" } },
    ...projects
      .filter((project) => project.exists)
      .map((project) => ({
        label: project.name,
        detail: project.dir,
        target: { scope: "project", projectDir: project.dir } as InstallTarget,
      })),
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm text-text-muted">Install into</legend>
      {options.map((option) => (
        <label
          key={option.detail}
          className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface p-3 ring-1 ring-border-subtle has-[:checked]:ring-accent"
        >
          <input
            type="radio"
            name="install-target"
            checked={sameTarget(option.target, target)}
            onChange={() => onChange(option.target)}
            className="mt-1 accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text">{option.label}</span>
            <span className="block truncate font-mono text-xs text-text-muted">
              {option.detail}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Link to a file this install wrote, inside the workspace browser for the chosen scope. */
function workspaceLink(plan: InstallPlan, itemId: string, items: DiscoveredItem[]): string | null {
  const kind = items.find((item) => item.id === itemId)?.kind;
  const directory = kind ? KIND_DIRECTORY[kind] : undefined;
  const writes = plan.fileWrites.filter((w) => w.itemId === itemId && w.status !== "identical");
  const preferred = writes.find((w) => w.targetPath.endsWith("SKILL.md")) ?? writes[0];
  if (!directory || !preferred) return null;
  const relative = scopeRelativePath(preferred.targetPath, plan.target);
  if (!relative.startsWith(`${directory}/`)) return null;
  const workspace: Workspace =
    plan.target.scope === "project" && plan.target.projectDir
      ? { kind: "project", dir: plan.target.projectDir }
      : { kind: "user" };
  return `${workspaceBasePath(workspace)}/${relative}`;
}

function ResultStep({
  plan,
  response,
  itemNames,
  items,
  updated,
}: {
  plan: InstallPlan;
  response: ApplyResponse;
  itemNames: Record<string, string>;
  items: DiscoveredItem[];
  updated: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {response.results.map((result) => {
          const link = result.ok ? workspaceLink(plan, result.itemId, items) : null;
          return (
            <li
              key={result.itemId}
              data-ok={result.ok}
              className="rounded-lg bg-surface p-3 text-sm ring-1 ring-border-subtle"
            >
              <p className={result.ok ? "text-success" : "text-danger"}>
                {result.ok ? (updated ? "Updated" : "Installed") : "Failed"}:{" "}
                {itemNames[result.itemId] ?? result.itemId}
              </p>
              {result.error ? <p className="text-xs text-text-muted">{result.error}</p> : null}
              {link ? (
                <Link
                  to={link}
                  className="text-xs font-medium text-accent underline underline-offset-4"
                >
                  Open in workspace
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {response.backups.length > 0 ? (
        <div className="text-xs text-text-muted">
          <p>Backups created:</p>
          <ul className="mt-1 list-disc pl-5 font-mono">
            {response.backups.map((path) => (
              <li key={path} className="break-all">
                {path}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ErrorNotice({ error }: { error: DiscoverApiError }) {
  return (
    <p role="alert" className="rounded-lg bg-surface p-3 text-sm text-danger ring-1 ring-danger">
      {error.code === "PLAN_CHANGED"
        ? "Things changed since you previewed this install. Go back and review the plan again."
        : error.message}
    </p>
  );
}

/** Shared 4-step install flow (spec §3.3): target, changes, trust review, apply + result. */
export function InstallDialog({ repo, items, onClose, update, skillsShId }: InstallDialogProps) {
  const { workspace } = useWorkspace();
  const [step, setStep] = useState<Step>(update ? "changes" : "target");
  const [target, setTarget] = useState<InstallTarget>(() => workspaceTarget(workspace));
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [resolutions, setResolutions] = useState<ResolutionMap>({});
  const [canApplyTrust, setCanApplyTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DiscoverApiError | null>(null);
  const [response, setResponse] = useState<ApplyResponse | null>(null);

  const itemNames = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item.name])),
    [items],
  );
  const request: PlanRequest = update
    ? { update }
    : { repo, itemIds: items.map((i) => i.id), target };

  async function loadPlan() {
    setBusy(true);
    setError(null);
    const result = await fetchPlan(request);
    setBusy(false);
    if (!result.ok) return setError(result);
    setPlan(result.plan);
    setResolutions({});
    setStep("changes");
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    const result = await applyPlan({
      ...request,
      resolutions,
      planHash: plan.planHash,
      acknowledgedDanger: hasDanger(plan.findings) && canApplyTrust,
      ...(skillsShId && { skillsShId }),
    });
    setBusy(false);
    if (!result.ok) return setError(result);
    setResponse(result);
    setStep("result");
  }

  useEffect(() => {
    if (update) void loadPlan();
    // The update plan is requested once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(next: Step) {
    setError(null);
    // Gate from the findings directly so Apply is never enabled before TrustPanel reports.
    if (next === "trust" && plan) setCanApplyTrust(!hasDanger(plan.findings));
    setStep(next);
  }

  const resolve = (path: string, resolution: ConflictResolution) =>
    setResolutions((prev) => ({ ...prev, [path]: resolution }));

  const blockedByConflicts = plan ? unresolvedConflicts(plan, resolutions).length > 0 : true;
  const title = update
    ? `Update ${items[0]?.name ?? "item"} from ${repo.owner}/${repo.repo}`
    : `Install ${items.length} item${items.length === 1 ? "" : "s"} from ${repo.owner}/${repo.repo}`;

  return (
    <Modal title={title} onClose={onClose}>
      <ol
        aria-label="Install steps"
        className="flex gap-3 border-b border-border-subtle px-4 py-2 text-xs"
      >
        {(update ? UPDATE_STEP_ORDER : STEP_ORDER).map((id) => (
          <li
            key={id}
            aria-current={id === step ? "step" : undefined}
            className={id === step ? "font-semibold text-text" : "text-text-muted"}
          >
            {STEP_LABELS[id]}
          </li>
        ))}
      </ol>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {step === "target" ? (
          <>
            <ul aria-label="Items to install" className="flex flex-wrap gap-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-text ring-1 ring-border-subtle"
                >
                  {item.name}
                </li>
              ))}
            </ul>
            <TargetStep target={target} onChange={setTarget} />
          </>
        ) : null}
        {step === "changes" && !plan && !error ? (
          <p className="text-sm text-text-muted">Checking the latest version…</p>
        ) : null}
        {step === "changes" && plan ? (
          <PlanPreview
            plan={plan}
            itemNames={itemNames}
            resolutions={resolutions}
            onResolve={resolve}
          />
        ) : null}
        {step === "trust" && plan ? (
          <TrustPanel
            findings={plan.findings}
            itemNames={itemNames}
            onCanApplyChange={setCanApplyTrust}
          />
        ) : null}
        {step === "result" && plan && response ? (
          <ResultStep
            plan={plan}
            response={response}
            itemNames={itemNames}
            items={items}
            updated={Boolean(update)}
          />
        ) : null}
        {error ? <ErrorNotice error={error} /> : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">
        {step === "target" ? (
          <button type="button" className={primaryButton} disabled={busy} onClick={loadPlan}>
            {busy ? "Planning…" : "Continue"}
          </button>
        ) : null}
        {step === "changes" ? (
          <>
            {update ? null : (
              <button type="button" className={secondaryButton} onClick={() => goTo("target")}>
                Back
              </button>
            )}
            <button
              type="button"
              className={primaryButton}
              disabled={blockedByConflicts}
              onClick={() => goTo("trust")}
            >
              Continue
            </button>
          </>
        ) : null}
        {step === "trust" ? (
          <>
            <button type="button" className={secondaryButton} onClick={() => goTo("changes")}>
              Back
            </button>
            {error?.code === "PLAN_CHANGED" ? (
              <button type="button" className={primaryButton} disabled={busy} onClick={loadPlan}>
                Review plan again
              </button>
            ) : (
              <button
                type="button"
                className={primaryButton}
                disabled={busy || !canApplyTrust || blockedByConflicts}
                onClick={apply}
              >
                {busy ? (update ? "Updating…" : "Installing…") : update ? "Update" : "Apply"}
              </button>
            )}
          </>
        ) : null}
        {step === "result" ? (
          <button type="button" className={primaryButton} onClick={onClose}>
            Done
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
