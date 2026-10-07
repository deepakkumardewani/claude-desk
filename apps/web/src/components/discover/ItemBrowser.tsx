import { useMemo, useState } from "react";
import type { DiscoveredItem, ItemKind } from "schema";
import {
  countSelectedByKind,
  groupVariants,
  pluginChildren,
  topLevelItems,
  type ItemGroup,
} from "../../lib/discover/variants";
import type { RepoSource } from "./ItemCard";
import { ItemList } from "./ItemList";
import { ItemBrowserToolbar } from "./ItemBrowserToolbar";
import { KIND_ORDER } from "./itemKinds";
import { SelectionDock } from "./SelectionDock";
import { useGroupSelection } from "./useGroupSelection";

export const EMPTY_SCAN_MESSAGE = "No Claude Code items found in this repo";

type ItemBrowserProps = {
  items: DiscoveredItem[];
  repo?: RepoSource;
  onOpen: (item: DiscoveredItem) => void;
  /** When provided, a floating dock offers "Install N" for the selected items. */
  onInstall?: (items: DiscoveredItem[]) => void;
};

function matchesText(item: DiscoveredItem, needle: string): boolean {
  return `${item.name} ${item.description ?? ""}`.toLowerCase().includes(needle);
}

/** A group (or plugin) stays visible when any copy, or any plugin child, matches the filter. */
function groupMatches(group: ItemGroup, needle: string): boolean {
  if (!needle) return true;
  return group.variants.some(
    (v) => matchesText(v, needle) || pluginChildren(v).some((c) => matchesText(c, needle)),
  );
}

function EmptyScan() {
  return (
    <div className="rounded-xl bg-surface-raised p-6 text-center ring-1 ring-border-subtle">
      <p className="font-medium text-text">{EMPTY_SCAN_MESSAGE}</p>
      <p className="mt-1 text-sm text-text-muted">
        We looked for SKILL.md skills, agents/ and commands/ markdown, .claude/settings.json (hooks
        and settings), .mcp.json servers and .claude-plugin plugins.
      </p>
    </div>
  );
}

/** Merged groups plus how many groups each kind has (tab counts). */
function useKindGroups(items: DiscoveredItem[]) {
  const groups = useMemo(() => groupVariants(topLevelItems(items)), [items]);
  const counts = useMemo(() => {
    const result = new Map<ItemKind, number>();
    for (const group of groups) result.set(group.kind, (result.get(group.kind) ?? 0) + 1);
    return result;
  }, [groups]);
  return { groups, counts };
}

function chosenVariants(groups: ItemGroup[], selected: ReadonlyMap<string, string>) {
  return groups.flatMap((g) => g.variants.filter((v) => selected.get(g.key) === v.id));
}

/** Kind tabs + text filter over merged groups, rendered as compact rows with a selection dock. */
export function ItemBrowser({ items, repo, onOpen, onInstall }: ItemBrowserProps) {
  const [requestedKind, setRequestedKind] = useState<ItemKind | null>(null);
  const [text, setText] = useState("");
  const selection = useGroupSelection();
  const { groups, counts } = useKindGroups(items);

  if (groups.length === 0) return <EmptyScan />;

  const presentKinds = KIND_ORDER.filter((kind) => counts.has(kind));
  const activeKind = requestedKind && counts.has(requestedKind) ? requestedKind : presentKinds[0];
  const needle = text.trim().toLowerCase();
  const visible = groups.filter((g) => g.kind === activeKind && groupMatches(g, needle));
  const selected = selection.selectionFor(groups);

  return (
    <div className="flex flex-col gap-4">
      <ItemBrowserToolbar
        kinds={presentKinds}
        counts={counts}
        activeKind={activeKind}
        onKindChange={setRequestedKind}
        text={text}
        onTextChange={setText}
      />
      <ItemList
        groups={visible}
        selected={selected}
        selection={selection}
        repo={repo}
        onOpen={onOpen}
      />
      {onInstall && selected.size > 0 ? (
        <SelectionDock
          counts={countSelectedByKind(selected, groups)}
          activeKind={activeKind}
          onSelectKind={setRequestedKind}
          onClear={selection.clear}
          onInstall={() => onInstall(chosenVariants(groups, selected))}
        />
      ) : null}
      {/* Keeps the last row clear of the floating dock. */}
      <div aria-hidden="true" className="pb-20" />
    </div>
  );
}
