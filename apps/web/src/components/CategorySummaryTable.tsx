import { useState } from "react";
import type { ContextGroup, ContextItem } from "../api/context";

export type CategorySummaryTableCategory = {
  name: string;
  tokens: number;
  percentage: number;
  color: string;
  items?: ContextItem[];
  groups?: ContextGroup[];
};

type Props = {
  categories: CategorySummaryTableCategory[];
};

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`size-3.5 shrink-0 text-text-muted transition-transform duration-200 ${
        expanded ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function leafCount(category: CategorySummaryTableCategory): number {
  const grouped = category.groups?.reduce((sum, group) => sum + group.items.length, 0) ?? 0;
  return grouped + (category.items?.length ?? 0);
}

function tokenShare(tokens: number | undefined, parentTokens: number): string {
  if (tokens === undefined || parentTokens <= 0) return "—";
  const share = (tokens / parentTokens) * 100;
  return share < 0.1 ? "<0.1%" : `${share.toFixed(1)}%`;
}

function ItemRows({
  items,
  parentTokens,
  label,
}: {
  items: ContextItem[];
  parentTokens: number;
  label: string;
}) {
  const sorted = [...items].sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0));
  return (
    <ul aria-label={label} className="flex flex-col py-1">
      {sorted.map((item, index) => (
        <li
          key={`${item.name}-${index}`}
          className="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-surface-soft"
        >
          <span className="min-w-0 flex-1 truncate text-text" title={item.name}>
            {item.name}
          </span>
          <span className="w-14 shrink-0 text-right tabular-nums text-text-muted">
            {tokenShare(item.tokens, parentTokens)}
          </span>
          <span className="w-24 shrink-0 text-right font-mono tabular-nums text-text">
            {item.tokens !== undefined ? item.tokens.toLocaleString() : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function GroupRow({ group, parentTokens }: { group: ContextGroup; parentTokens: number }) {
  const [expanded, setExpanded] = useState(false);
  const count = group.items.length;

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronIcon expanded={expanded} />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-left font-medium text-text">
          <span className="truncate">{group.name}</span>
          <span className="shrink-0 text-xs font-normal tabular-nums text-text-muted">{count}</span>
        </span>
        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-text-muted">
          {tokenShare(group.tokens, parentTokens)}
        </span>
        <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-text">
          {group.tokens.toLocaleString()}
        </span>
      </button>
      {expanded ? (
        <div className="ml-6 max-h-56 overflow-y-auto overscroll-contain pr-1">
          <ItemRows
            items={group.items}
            parentTokens={parentTokens}
            label={`${group.name} skills`}
          />
        </div>
      ) : null}
    </div>
  );
}

function CategoryBody({ category }: { category: CategorySummaryTableCategory }) {
  const groups = category.groups ?? [];
  const items = category.items ?? [];

  return (
    <div className="mb-2 ml-6 flex flex-col gap-0.5">
      {groups.map((group) => (
        <GroupRow key={group.name} group={group} parentTokens={category.tokens} />
      ))}
      {items.length > 0 ? (
        <div className="max-h-56 overflow-y-auto overscroll-contain">
          <ItemRows items={items} parentTokens={category.tokens} label={`${category.name} items`} />
        </div>
      ) : null}
    </div>
  );
}

function CategoryRow({ category }: { category: CategorySummaryTableCategory }) {
  const count = leafCount(category);
  const expandable = count > 0;
  const [expanded, setExpanded] = useState(() => (category.groups?.length ?? 0) > 0);

  if (!expandable) {
    return (
      <div role="row" className="flex items-center gap-3 rounded-lg px-3 py-2.5">
        <span aria-hidden="true" className="w-3.5 shrink-0" />
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: category.color }}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {category.name}
        </span>
        <span className="w-14 shrink-0 text-right text-sm text-text-muted">
          {category.percentage.toFixed(1)}%
        </span>
        <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-text">
          {category.tokens.toLocaleString()}
        </span>
      </div>
    );
  }

  return (
    <div role="row">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronIcon expanded={expanded} />
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: category.color }}
        />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-sm font-medium text-text">
          <span className="truncate">{category.name}</span>
          <span className="shrink-0 text-xs font-normal tabular-nums text-text-muted">{count}</span>
        </span>
        <span className="w-14 shrink-0 text-right text-sm text-text-muted">
          {category.percentage.toFixed(1)}%
        </span>
        <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-text">
          {category.tokens.toLocaleString()}
        </span>
      </button>
      {expanded ? <CategoryBody category={category} /> : null}
    </div>
  );
}

export function CategorySummaryTable({ categories }: Props) {
  return (
    <div role="table" aria-label="Context category breakdown" className="flex flex-col gap-0.5">
      <div
        role="row"
        className="flex items-center gap-3 px-3 pb-2 text-xs font-medium uppercase tracking-wider text-text-muted"
      >
        <span aria-hidden="true" className="w-3.5 shrink-0" />
        <span aria-hidden="true" className="size-2.5 shrink-0" />
        <span role="columnheader" className="flex-1 text-left">
          Category
        </span>
        <span role="columnheader" className="w-14 shrink-0 text-right">
          %
        </span>
        <span role="columnheader" className="w-24 shrink-0 text-right">
          Tokens
        </span>
      </div>

      {categories.map((category) => (
        <CategoryRow key={category.name} category={category} />
      ))}
    </div>
  );
}
