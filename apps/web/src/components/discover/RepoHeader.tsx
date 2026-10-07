import { useMemo, type ReactNode } from "react";
import type { ItemKind } from "schema";
import type { ScanResponse } from "../../lib/discoverApi";
import { groupVariants, topLevelItems } from "../../lib/discover/variants";
import { ExternalLinkIcon } from "../icons";
import { KIND_ORDER, kindCountLabel } from "./itemKinds";

const SHORT_SHA_LENGTH = 7;
const PILL_CLASS =
  "inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted ring-1 ring-border-subtle";

/** "71 skills · 4 agents" plus how many duplicate copies were folded away. */
function ScanSummary({ items }: { items: ScanResponse["items"] }) {
  const { parts, merged } = useMemo(() => {
    const top = topLevelItems(items);
    const groups = groupVariants(top);
    const counts = new Map<ItemKind, number>();
    for (const group of groups) counts.set(group.kind, (counts.get(group.kind) ?? 0) + 1);
    return {
      parts: KIND_ORDER.filter((k) => counts.has(k)).map((k) => kindCountLabel(k, counts.get(k)!)),
      merged: top.length - groups.length,
    };
  }, [items]);
  if (parts.length === 0) return null;
  return (
    <p className="text-sm text-text">
      {parts.join(" · ")}
      {merged > 0 ? (
        <span className="text-text-muted"> ({merged} duplicate copies merged)</span>
      ) : null}
    </p>
  );
}

export function RepoHeader({ scan, children }: { scan: ScanResponse; children?: ReactNode }) {
  const { repo } = scan;
  return (
    <header className="flex flex-col gap-2 rounded-xl bg-surface-raised p-4 ring-1 ring-border-subtle">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-text">
          {repo.owner}/{repo.repo}
        </h2>
        <a
          href={repo.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text ring-1 ring-border-subtle transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open on GitHub
          <ExternalLinkIcon />
        </a>
      </div>
      {repo.description ? <p className="text-sm text-text-muted">{repo.description}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span aria-label="Stars" className={PILL_CLASS}>
          ★ {repo.stars.toLocaleString()}
        </span>
        <span className={PILL_CLASS}>
          {repo.ref} @ <code className="font-mono">{repo.sha.slice(0, SHORT_SHA_LENGTH)}</code>
        </span>
        {repo.subpath ? <span className={`${PILL_CLASS} font-mono`}>{repo.subpath}</span> : null}
      </div>
      <ScanSummary items={scan.items} />
      {children}
    </header>
  );
}
