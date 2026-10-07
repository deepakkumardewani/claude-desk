import type { DiscoveredItem } from "schema";
import type { ItemGroup } from "../../lib/discover/variants";
import type { RepoSource } from "./ItemCard";
import { ItemRow } from "./ItemRow";
import { SelectAllRow } from "./SelectAllRow";
import type { useGroupSelection } from "./useGroupSelection";

type ItemListProps = {
  /** Groups already narrowed to the active kind and text filter. */
  groups: ItemGroup[];
  selected: ReadonlyMap<string, string>;
  selection: ReturnType<typeof useGroupSelection>;
  repo?: RepoSource;
  onOpen: (item: DiscoveredItem) => void;
};

export function ItemList({ groups, selected, selection, repo, onOpen }: ItemListProps) {
  if (groups.length === 0) {
    return <p className="text-sm text-text-muted">No items match the current filters.</p>;
  }

  const installable = groups.filter((g) => selection.variantFor(g).installable !== false);
  const selectedCount = installable.filter((g) => selected.has(g.key)).length;

  return (
    <div
      role="tabpanel"
      className="overflow-hidden rounded-xl bg-surface-raised ring-1 ring-border-subtle"
    >
      <SelectAllRow
        total={installable.length}
        selectedCount={selectedCount}
        onChange={(on) =>
          selection.setMany(
            installable.map((g) => g.key),
            on,
          )
        }
      />
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {groups.map((group) => (
          <ItemRow
            key={group.key}
            item={selection.variantFor(group)}
            repo={repo}
            onOpen={onOpen}
            selection={{
              selected: selected.has(group.key),
              onToggle: () => selection.toggle(group.key),
            }}
            sources={
              group.variants.length > 1
                ? {
                    variants: group.variants,
                    onChange: (id) => selection.chooseSource(group.key, id),
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}
