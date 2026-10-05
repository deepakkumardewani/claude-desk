import { useEffect, useState } from "react";
import type { TrustFinding } from "schema";

type Severity = TrustFinding["severity"];

type TrustPanelProps = {
  findings: TrustFinding[];
  /** Display names keyed by item id; falls back to the id. */
  itemNames?: Record<string, string>;
  /**
   * Called whenever the Apply gate changes: `true` when Apply may proceed
   * (no danger findings, or the user has acknowledged them). Wired in Phase 5.
   */
  onCanApplyChange?: (canApply: boolean) => void;
};

const SEVERITY_META: Record<Severity, { glyph: string; label: string; className: string }> = {
  danger: { glyph: "⚠", label: "Danger", className: "text-danger" },
  caution: { glyph: "!", label: "Caution", className: "text-warning" },
  info: { glyph: "i", label: "Info", className: "text-text-muted" },
};

const SEVERITY_ORDER: Severity[] = ["danger", "caution", "info"];

export const hasDanger = (findings: TrustFinding[]): boolean =>
  findings.some((finding) => finding.severity === "danger");

function groupByItem(findings: TrustFinding[]): Map<string, TrustFinding[]> {
  const groups = new Map<string, TrustFinding[]>();
  for (const finding of findings) {
    groups.set(finding.itemId, [...(groups.get(finding.itemId) ?? []), finding]);
  }
  return groups;
}

const bySeverity = (a: TrustFinding, b: TrustFinding) =>
  SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);

function FindingRow({ finding }: { finding: TrustFinding }) {
  const meta = SEVERITY_META[finding.severity];
  const location = finding.file
    ? `${finding.file}${finding.line ? `:${finding.line}` : ""}`
    : finding.line
      ? `line ${finding.line}`
      : undefined;
  return (
    <li data-severity={finding.severity} data-rule={finding.rule} className="flex gap-2 text-sm">
      <span
        role="img"
        aria-label={meta.label}
        className={`mt-0.5 w-4 shrink-0 text-center font-bold ${meta.className}`}
      >
        {meta.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-text">{finding.message}</p>
        {location ? <p className="font-mono text-xs text-text-muted">{location}</p> : null}
        {finding.evidence ? (
          <pre className="mt-1 overflow-x-auto rounded bg-surface px-2 py-1 font-mono text-xs text-text-muted ring-1 ring-border-subtle">
            {finding.line ? `${finding.line}: ` : ""}
            {finding.evidence}
          </pre>
        ) : null}
      </div>
    </li>
  );
}

/** Findings grouped by item. The ack checkbox only exists (and only gates Apply) when a danger finding is present. */
export function TrustPanel({ findings, itemNames = {}, onCanApplyChange }: TrustPanelProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const dangerous = hasDanger(findings);
  const canApply = !dangerous || acknowledged;

  useEffect(() => {
    onCanApplyChange?.(canApply);
  }, [canApply, onCanApplyChange]);

  // A new set of findings must be re-reviewed.
  useEffect(() => {
    setAcknowledged(false);
  }, [findings]);

  const groups = [...groupByItem(findings)];
  return (
    <section aria-label="Trust review" className="flex flex-col gap-4">
      {groups.length === 0 ? <p className="text-sm text-text-muted">No findings.</p> : null}
      {groups.map(([itemId, itemFindings]) => {
        const tokenCost = itemFindings.find((f) => f.rule === "token-cost");
        const rows = itemFindings.filter((f) => f.rule !== "token-cost").sort(bySeverity);
        return (
          <div
            key={itemId}
            data-testid="trust-item"
            className="flex flex-col gap-2 rounded-xl bg-surface-raised p-3 ring-1 ring-border-subtle"
          >
            <h4 className="font-medium text-text">{itemNames[itemId] ?? itemId}</h4>
            {tokenCost ? (
              <p data-testid="token-cost" className="text-xs text-text-muted">
                {tokenCost.message}
              </p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {rows.map((finding, index) => (
                <FindingRow
                  key={`${finding.rule}-${finding.file ?? ""}-${finding.line ?? index}-${index}`}
                  finding={finding}
                />
              ))}
            </ul>
          </div>
        );
      })}
      {dangerous ? (
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="size-4 accent-accent"
          />
          I've reviewed these findings
        </label>
      ) : null}
    </section>
  );
}
