import { useMemo, useState } from "react";
import type { DiscoveredItem, InstalledEntry, ItemKind } from "schema";
import { getItemKindColor } from "../../lib/categoryColors";
import { useInstalledEntry } from "../../lib/installs";

const KIND_ORDER: ItemKind[] = [
  "skill",
  "agent",
  "command",
  "hook",
  "mcp",
  "setting",
  "plugin",
  "convertible",
];

const KIND_LABELS: Record<ItemKind, string> = {
  skill: "Skills",
  agent: "Agents",
  command: "Commands",
  hook: "Hooks",
  mcp: "MCP",
  setting: "Settings",
  plugin: "Plugins",
  convertible: "Convertible",
};

const KIND_SINGULAR: Record<ItemKind, string> = {
  skill: "skill",
  agent: "agent",
  command: "command",
  hook: "hook",
  mcp: "mcp",
  setting: "setting",
  plugin: "plugin",
  convertible: "convertible",
};

export const EMPTY_SCAN_MESSAGE = "No Claude Code items found in this repo";

export function pluginChildren(item: DiscoveredItem): DiscoveredItem[] {
  if (item.kind !== "plugin") return [];
  const children = (item.payload as { children?: unknown } | undefined)?.children;
  return Array.isArray(children) ? (children as DiscoveredItem[]) : [];
}

function matchesText(item: DiscoveredItem, needle: string): boolean {
  if (!needle) return true;
  return `${item.name} ${item.description ?? ""}`.toLowerCase().includes(needle);
}

/** A plugin stays visible when it or any of its children match the text filter. */
function matchesWithChildren(item: DiscoveredItem, needle: string): boolean {
  return matchesText(item, needle) || pluginChildren(item).some((c) => matchesText(c, needle));
}

/** The scanned repo, so a card can tell whether it is already installed (source + path). */
export type RepoSource = { owner: string; repo: string };

type ItemCardProps = {
  item: DiscoveredItem;
  repo?: RepoSource;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (item: DiscoveredItem) => void;
  /** Rendered inside a plugin card: compact, no checkbox. */
  nested?: boolean;
};

export function KindChip({ kind }: { kind: ItemKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted ring-1 ring-border-subtle">
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ backgroundColor: getItemKindColor(kind) }}
      />
      {KIND_SINGULAR[kind]}
    </span>
  );
}

/** "Installed" or "Update available" for an item already installed in the active scope. */
export function InstalledBadge({ status }: { status: InstalledEntry["status"] }) {
  const updatable = status === "update-available";
  return (
    <span
      data-testid="installed-badge"
      className={`inline-flex h-fit whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium ring-1 ${
        updatable ? "text-accent ring-accent" : "text-success ring-success"
      }`}
    >
      {updatable ? "Update available" : "Installed"}
    </span>
  );
}

export function ItemCard({
  item,
  repo,
  selected,
  onToggle,
  onOpen,
  nested = false,
}: ItemCardProps) {
  const children = pluginChildren(item);
  const source = useMemo(
    () => (repo ? { owner: repo.owner, repo: repo.repo, path: item.path } : undefined),
    [repo, item.path],
  );
  const installed = useInstalledEntry({ kind: item.kind, source });
  return (
    <div
      data-testid="item-card"
      data-kind={item.kind}
      className="flex flex-col gap-3 rounded-xl bg-surface-raised p-4 ring-1 ring-border-subtle"
    >
      <div className="flex items-start gap-3">
        {nested ? null : (
          <input
            type="checkbox"
            aria-label={`Select ${item.name}`}
            checked={selected}
            onChange={() => onToggle(item.id)}
            className="mt-1 size-4 shrink-0 accent-accent"
          />
        )}
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="min-w-0 flex-1 cursor-pointer rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex flex-wrap items-center gap-2">
            <KindChip kind={item.kind} />
            <span className="truncate font-medium text-text" title={item.name}>
              {item.name}
            </span>
          </span>
          {item.description ? (
            <span className="mt-1.5 line-clamp-2 text-sm text-text-muted" title={item.description}>
              {item.description}
            </span>
          ) : null}
          <span
            className="mt-1.5 block truncate font-mono text-xs text-text-muted"
            title={item.path}
          >
            {item.path}
          </span>
        </button>
        <span data-slot="badges" className="flex shrink-0 gap-1.5">
          {installed ? <InstalledBadge status={installed.status} /> : null}
        </span>
      </div>
      {children.length > 0 ? (
        <ul aria-label={`${item.name} contents`} className="ml-7 flex flex-col gap-2">
          {children.map((child) => (
            <li key={child.id}>
              <ItemCard
                item={child}
                repo={repo}
                selected={false}
                onToggle={onToggle}
                onOpen={onOpen}
                nested
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type ItemBrowserProps = {
  items: DiscoveredItem[];
  repo?: RepoSource;
  onOpen: (item: DiscoveredItem) => void;
  /** When provided, a sticky footer offers "Install…" for the selected items. */
  onInstall?: (items: DiscoveredItem[]) => void;
};

function SelectionFooter({ count, onInstall }: { count: number; onInstall: () => void }) {
  return (
    <div
      data-testid="selection-footer"
      className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-xl bg-surface-raised px-4 py-3 shadow-lg ring-1 ring-border-subtle"
    >
      <span className="text-sm text-text">{count} selected</span>
      <button
        type="button"
        onClick={onInstall}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Install…
      </button>
    </div>
  );
}

/** Kind summary strip (filter chips) + text filter + items grouped by kind. */
export function ItemBrowser({ items, repo, onOpen, onInstall }: ItemBrowserProps) {
  const [kindFilter, setKindFilter] = useState<ItemKind | null>(null);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Marketplace plugins own their children; never show those twice.
  const topLevel = useMemo(() => {
    const nestedIds = new Set(items.flatMap((i) => pluginChildren(i).map((c) => c.id)));
    return items.filter((item) => !nestedIds.has(item.id));
  }, [items]);

  const counts = useMemo(() => {
    const result = new Map<ItemKind, number>();
    for (const item of topLevel) result.set(item.kind, (result.get(item.kind) ?? 0) + 1);
    return result;
  }, [topLevel]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  if (topLevel.length === 0) {
    return (
      <div className="rounded-xl bg-surface-raised p-6 text-center ring-1 ring-border-subtle">
        <p className="font-medium text-text">{EMPTY_SCAN_MESSAGE}</p>
        <p className="mt-1 text-sm text-text-muted">
          We looked for SKILL.md skills, agents/ and commands/ markdown, .claude/settings.json
          (hooks and settings), .mcp.json servers and .claude-plugin plugins.
        </p>
      </div>
    );
  }

  const needle = text.trim().toLowerCase();
  const visible = topLevel.filter(
    (item) =>
      (kindFilter === null || item.kind === kindFilter) && matchesWithChildren(item, needle),
  );
  const presentKinds = KIND_ORDER.filter((kind) => counts.has(kind));
  const selectedItems = topLevel.filter((item) => selected.has(item.id));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-2">
          {presentKinds.map((kind) => {
            const active = kindFilter === kind;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={active}
                onClick={() => setKindFilter(active ? null : kind)}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                  active
                    ? "bg-accent text-accent-fg ring-accent"
                    : "bg-surface-raised text-text-muted ring-border-subtle hover:text-text"
                }`}
              >
                {KIND_LABELS[kind]} {counts.get(kind)}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          aria-label="Filter items"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Filter by name or description"
          className="ml-auto w-full rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text sm:w-64"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-text-muted">No items match the current filters.</p>
      ) : (
        presentKinds.map((kind) => {
          const group = visible.filter((item) => item.kind === kind);
          if (group.length === 0) return null;
          return (
            <section key={kind} aria-label={KIND_LABELS[kind]} className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {KIND_LABELS[kind]} ({group.length})
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {group.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    repo={repo}
                    selected={selected.has(item.id)}
                    onToggle={toggle}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
      {onInstall && selectedItems.length > 0 ? (
        <SelectionFooter count={selectedItems.length} onInstall={() => onInstall(selectedItems)} />
      ) : null}
    </div>
  );
}
