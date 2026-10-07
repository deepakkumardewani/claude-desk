import { useState } from "react";
import type { DiscoveredItem } from "schema";
import { pluginChildren } from "../../lib/discover/variants";
import type { RepoSource } from "./ItemCard";
import { ItemRowLine, type RowSelection, type RowSources } from "./ItemRowLine";

export type { RowSelection, RowSources };

type ItemRowProps = {
  item: DiscoveredItem;
  repo?: RepoSource;
  onOpen: (item: DiscoveredItem) => void;
  /** Omitted for rows that cannot be selected (plugin children). */
  selection?: RowSelection;
  /** Present only when the row stands for several merged copies. */
  sources?: RowSources;
  nested?: boolean;
};

type PluginChildrenProps = {
  parent: DiscoveredItem;
  children: DiscoveredItem[];
  repo?: RepoSource;
  onOpen: (item: DiscoveredItem) => void;
};

// Lives here, not in its own file, because it renders ItemRow recursively.
function PluginChildren({ parent, children, repo, onOpen }: PluginChildrenProps) {
  return (
    <ul
      aria-label={`${parent.name} contents`}
      className="divide-y divide-border-subtle border-t border-border-subtle"
    >
      {children.map((child) => (
        <ItemRow key={child.id} item={child} repo={repo} onOpen={onOpen} nested />
      ))}
    </ul>
  );
}

/** One compact line of the item list, plus its plugin children when expanded. */
export function ItemRow({ item, repo, onOpen, selection, sources, nested = false }: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const children = pluginChildren(item);
  const hasChildren = children.length > 0;
  return (
    <li data-testid="item-row" data-kind={item.kind} className="list-none">
      <ItemRowLine
        item={item}
        repo={repo}
        onOpen={onOpen}
        selection={selection}
        sources={sources}
        expansion={
          hasChildren ? { open: expanded, onToggle: () => setExpanded((v) => !v) } : undefined
        }
        nested={nested}
      />
      {expanded && hasChildren ? (
        <PluginChildren parent={item} repo={repo} onOpen={onOpen}>
          {children}
        </PluginChildren>
      ) : null}
    </li>
  );
}
