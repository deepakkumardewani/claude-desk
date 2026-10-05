import type { InstallPlan, InstallTarget } from "schema";
import type { ConflictResolution } from "../../lib/discoverApi";

type FileWrite = InstallPlan["fileWrites"][number];
type FileStatus = FileWrite["status"];
type SettingsChange = InstallPlan["settingsChanges"][number];
type McpChange = InstallPlan["mcpChanges"][number];
type MarketplaceChange = InstallPlan["marketplaceChanges"][number];

/** Conflict choices keyed by a file's absolute target path, or `mcpResolutionKey(name)` for servers. */
export type ResolutionMap = Record<string, ConflictResolution>;

/** Must match the CLI's `mcpResolutionKey` (apps/cli/src/discover/plan.ts). */
export const mcpResolutionKey = (name: string): string => `mcp:${name}`;

const STATUS_ORDER: FileStatus[] = ["conflict", "overwrite", "new", "identical"];

const STATUS_META: Record<FileStatus, { label: string; className: string }> = {
  conflict: { label: "Conflict", className: "text-danger" },
  overwrite: { label: "Overwrite", className: "text-warning" },
  new: { label: "New", className: "text-success" },
  identical: { label: "Identical", className: "text-text-muted" },
};

const RESOLUTION_LABELS: Record<ConflictResolution, string> = {
  skip: "Skip",
  overwrite: "Overwrite (backup kept)",
  rename: "Keep both",
};

const FILE_CHOICES: ConflictResolution[] = ["skip", "overwrite", "rename"];
// The CLI refuses to overwrite an existing MCP server, so only offer what it can honor.
const MCP_CHOICES: ConflictResolution[] = ["skip", "rename"];

const RENAME_FIRST_ATTEMPT = 2;
const BYTES_PER_KB = 1024;

/** Path relative to the scope root (`~/.claude` or `<project>/.claude`), for display and links. */
export function scopeRelativePath(targetPath: string, target: InstallTarget): string {
  if (target.scope === "project" && target.projectDir) {
    const prefix = `${target.projectDir.replace(/\/$/, "")}/.claude/`;
    if (targetPath.startsWith(prefix)) return targetPath.slice(prefix.length);
  }
  const marker = "/.claude/";
  const index = targetPath.indexOf(marker);
  return index === -1 ? targetPath : targetPath.slice(index + marker.length);
}

/** Mirrors the server's first alternate name (`SKILL.md` -> `SKILL-2.md`); it may pick a later free one. */
export function suggestedRename(path: string): string {
  const dot = path.lastIndexOf(".");
  const hasExt = dot > path.lastIndexOf("/") + 1;
  return hasExt
    ? `${path.slice(0, dot)}-${RENAME_FIRST_ATTEMPT}${path.slice(dot)}`
    : `${path}-${RENAME_FIRST_ATTEMPT}`;
}

/** Resolution keys of every conflict (file or MCP server) still awaiting a choice. */
export function unresolvedConflicts(plan: InstallPlan, resolutions: ResolutionMap): string[] {
  const keys = [
    ...plan.fileWrites.filter((w) => w.status === "conflict").map((w) => w.targetPath),
    ...plan.mcpChanges.filter((m) => m.status === "conflict").map((m) => mcpResolutionKey(m.name)),
  ];
  return keys.filter((key) => !resolutions[key]);
}

function formatSize(bytes: number): string {
  return bytes < BYTES_PER_KB ? `${bytes} B` : `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
}

type ConflictChoiceProps = {
  /** Unique within the dialog; scopes the radio group and legend. */
  id: string;
  label: string;
  choices: ConflictResolution[];
  value: ConflictResolution | undefined;
  onChange: (resolution: ConflictResolution) => void;
  /** Shown beside "Keep both" once chosen. */
  renamePreview?: string;
};

function ConflictChoice({
  id,
  label,
  choices,
  value,
  onChange,
  renamePreview,
}: ConflictChoiceProps) {
  return (
    <fieldset className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
      <legend className="sr-only">Resolution for {label}</legend>
      {choices.map((choice) => (
        <label key={choice} className="flex items-center gap-1.5 text-xs text-text">
          <input
            type="radio"
            name={`resolution-${id}`}
            checked={value === choice}
            onChange={() => onChange(choice)}
            className="accent-accent"
          />
          {RESOLUTION_LABELS[choice]}
          {choice === "rename" && value === "rename" && renamePreview ? (
            <span className="font-mono text-text-muted">→ {renamePreview}</span>
          ) : null}
        </label>
      ))}
    </fieldset>
  );
}

// ---------- settings diff ----------

type DiffMarker = "+" | "~" | " ";
type DiffRow = { marker: DiffMarker; text: string };

const MARKER_CLASS: Record<DiffMarker, string> = {
  "+": "text-success",
  "~": "text-warning",
  " ": "text-text-muted",
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const show = (value: unknown): string => JSON.stringify(value) ?? "undefined";

/** Structured added / changed / unchanged rows (D12: no text-diff library). */
export function diffRows(before: unknown, after: unknown): DiffRow[] {
  if (Array.isArray(after) && (before === undefined || Array.isArray(before))) {
    const known = new Set((before ?? []).map(show));
    return after.map((entry) => ({
      marker: known.has(show(entry)) ? " " : "+",
      text: show(entry),
    }));
  }
  if (isPlainObject(after) && (before === undefined || isPlainObject(before))) {
    return Object.entries(after).flatMap(([key, value]): DiffRow[] => {
      const prior = before?.[key];
      if (prior === undefined) return [{ marker: "+", text: `${key}: ${show(value)}` }];
      if (show(prior) === show(value)) return [{ marker: " ", text: `${key}: ${show(value)}` }];
      const nested = typeof value === "object" && value !== null && typeof prior === typeof value;
      if (nested && Array.isArray(prior) === Array.isArray(value)) {
        return diffRows(prior, value).map((row) => ({ ...row, text: `${key}: ${row.text}` }));
      }
      return [{ marker: "~", text: `${key}: ${show(prior)} → ${show(value)}` }];
    });
  }
  if (before === undefined) return [{ marker: "+", text: show(after) }];
  return [{ marker: "~", text: `${show(before)} → ${show(after)}` }];
}

function SettingsSection({
  changes,
  itemNames,
}: {
  changes: SettingsChange[];
  itemNames: Record<string, string>;
}) {
  return (
    <section aria-label="Settings changes" className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Settings ({changes.length})
      </h4>
      <ul className="flex flex-col gap-2">
        {changes.map((change) => (
          <li
            key={`${change.itemId}:${change.pointer}`}
            className="rounded-lg bg-surface p-2.5 ring-1 ring-border-subtle"
          >
            <span className="break-all font-mono text-xs text-text">{change.pointer}</span>
            <p className="text-xs text-text-muted">{itemNames[change.itemId] ?? change.itemId}</p>
            <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-xs">
              {diffRows(change.before, change.after).map((row, index) => (
                <li
                  key={index}
                  data-marker={row.marker}
                  className={`break-all ${MARKER_CLASS[row.marker]}`}
                >
                  <span aria-hidden="true" className="mr-2 inline-block w-3">
                    {row.marker}
                  </span>
                  {row.text}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function McpSection({
  changes,
  itemNames,
  resolutions,
  onResolve,
}: {
  changes: McpChange[];
  itemNames: Record<string, string>;
  resolutions: ResolutionMap;
  onResolve: PlanPreviewProps["onResolve"];
}) {
  return (
    <section aria-label="MCP servers" className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        MCP servers ({changes.length})
      </h4>
      <ul className="flex flex-col gap-2">
        {changes.map((change) => {
          const key = mcpResolutionKey(change.name);
          const conflict = change.status === "conflict";
          return (
            <li
              key={`${change.itemId}:${change.name}`}
              data-status={change.status}
              className="rounded-lg bg-surface p-2.5 ring-1 ring-border-subtle"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="break-all font-mono text-xs text-text">{change.name}</span>
                <span className={`text-xs ${conflict ? "text-danger" : "text-success"}`}>
                  {conflict ? "Name already in use" : "New"}
                </span>
              </div>
              <p className="text-xs text-text-muted">{itemNames[change.itemId] ?? change.itemId}</p>
              {conflict ? (
                <ConflictChoice
                  id={key}
                  label={`MCP server ${change.name}`}
                  choices={MCP_CHOICES}
                  value={resolutions[key]}
                  onChange={(resolution) => onResolve(key, resolution)}
                  renamePreview={`${change.name}-${RENAME_FIRST_ATTEMPT}`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MarketplaceSection({ changes }: { changes: MarketplaceChange[] }) {
  const byMarketplace = new Map<string, MarketplaceChange[]>();
  for (const change of changes) {
    byMarketplace.set(change.marketplace, [
      ...(byMarketplace.get(change.marketplace) ?? []),
      change,
    ]);
  }
  return (
    <section aria-label="Marketplace" className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Marketplace ({byMarketplace.size})
      </h4>
      <ul className="flex flex-col gap-2">
        {[...byMarketplace].map(([marketplace, entries]) => (
          <li key={marketplace} className="rounded-lg bg-surface p-2.5 ring-1 ring-border-subtle">
            <p className="text-xs text-text">
              Adds marketplace <span className="font-mono">{marketplace}</span>
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-text-muted">
              {entries.map((entry) => (
                <li key={entry.itemId}>
                  Enables plugin{" "}
                  <span className="font-mono">{`${entry.plugin}@${marketplace}`}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

type PlanPreviewProps = {
  plan: InstallPlan;
  itemNames: Record<string, string>;
  resolutions: ResolutionMap;
  onResolve: (targetPath: string, resolution: ConflictResolution) => void;
};

function FilesSection({ plan, itemNames, resolutions, onResolve }: PlanPreviewProps) {
  const groups = STATUS_ORDER.map((status) => ({
    status,
    writes: plan.fileWrites.filter((w) => w.status === status),
  })).filter((group) => group.writes.length > 0);

  return (
    <>
      {groups.map(({ status, writes }) => (
        <section
          key={status}
          aria-label={STATUS_META[status].label}
          className="flex flex-col gap-2"
        >
          <h4
            className={`text-xs font-semibold uppercase tracking-wide ${STATUS_META[status].className}`}
          >
            {STATUS_META[status].label} ({writes.length})
          </h4>
          <ul className="flex flex-col gap-2">
            {writes.map((write) => {
              const path = scopeRelativePath(write.targetPath, plan.target);
              return (
                <li
                  key={write.targetPath}
                  data-status={status}
                  className="rounded-lg bg-surface p-2.5 ring-1 ring-border-subtle"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="break-all font-mono text-xs text-text">{path}</span>
                    <span className="shrink-0 text-xs text-text-muted">
                      {formatSize(write.bytes)}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    {itemNames[write.itemId] ?? write.itemId}
                  </p>
                  {status === "conflict" ? (
                    <ConflictChoice
                      id={write.targetPath}
                      label={path}
                      choices={FILE_CHOICES}
                      value={resolutions[write.targetPath]}
                      onChange={(resolution) => onResolve(write.targetPath, resolution)}
                      renamePreview={suggestedRename(path)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Files the new version no longer ships; an update deletes them. */
function RemovalsSection({ plan }: { plan: InstallPlan }) {
  const removals = plan.fileRemovals ?? [];
  if (removals.length === 0) return null;
  return (
    <section aria-label="Removed" className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-danger">
        Removed ({removals.length})
      </h4>
      <ul className="flex flex-col gap-2">
        {removals.map((removal) => (
          <li
            key={removal.targetPath}
            data-status="removed"
            className="rounded-lg bg-surface p-2.5 ring-1 ring-border-subtle"
          >
            <span className="break-all font-mono text-xs text-text">
              {scopeRelativePath(removal.targetPath, plan.target)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything the plan would change: files by status, settings diffs, MCP servers, marketplaces. */
export function PlanPreview(props: PlanPreviewProps) {
  const { plan } = props;
  const { settingsChanges, mcpChanges, marketplaceChanges } = plan;
  const hasChanges =
    plan.fileWrites.length +
      (plan.fileRemovals?.length ?? 0) +
      settingsChanges.length +
      mcpChanges.length +
      marketplaceChanges.length >
    0;

  if (!hasChanges)
    return <p className="text-sm text-text-muted">This selection changes nothing.</p>;

  return (
    <div className="flex flex-col gap-4">
      <FilesSection {...props} />
      <RemovalsSection plan={plan} />
      {settingsChanges.length > 0 ? (
        <SettingsSection changes={settingsChanges} itemNames={props.itemNames} />
      ) : null}
      {mcpChanges.length > 0 ? (
        <McpSection
          changes={mcpChanges}
          itemNames={props.itemNames}
          resolutions={props.resolutions}
          onResolve={props.onResolve}
        />
      ) : null}
      {marketplaceChanges.length > 0 ? <MarketplaceSection changes={marketplaceChanges} /> : null}
    </div>
  );
}
