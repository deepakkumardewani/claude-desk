import { useMemo } from "react";
import type { DiscoveredItem } from "schema";
import { useInstalledEntry } from "../../lib/installs";
import { ChevronDownIcon } from "../icons";
import { InstalledBadge, type RepoSource } from "./ItemCard";
import { SourcePicker } from "./SourcePicker";

export type RowSelection = { selected: boolean; onToggle: () => void };
export type RowSources = { variants: DiscoveredItem[]; onChange: (variantId: string) => void };
export type RowExpansion = { open: boolean; onToggle: () => void };

type ItemRowLineProps = {
  item: DiscoveredItem;
  repo?: RepoSource;
  onOpen: (item: DiscoveredItem) => void;
  selection?: RowSelection;
  sources?: RowSources;
  /** Present only when the row has plugin children to reveal. */
  expansion?: RowExpansion;
  nested: boolean;
};

const NOT_INSTALLABLE_HINT = "Too large to install";

function RowCheckbox({ item, selection }: { item: DiscoveredItem; selection: RowSelection }) {
  const installable = item.installable !== false;
  return (
    <input
      type="checkbox"
      aria-label={`Select ${item.name}`}
      checked={selection.selected}
      disabled={!installable}
      title={installable ? undefined : NOT_INSTALLABLE_HINT}
      onChange={selection.onToggle}
      className="relative z-10 size-4 shrink-0 accent-accent"
    />
  );
}

function ExpandButton({ name, expansion }: { name: string; expansion: RowExpansion }) {
  const { open, onToggle } = expansion;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? "Collapse" : "Expand"} ${name}`}
      onClick={onToggle}
      className="relative z-10 shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDownIcon open={open} />
    </button>
  );
}

function RowDescription({ description }: { description?: string }) {
  if (!description) return <span className="hidden md:block md:flex-1" />;
  return (
    <p
      title={description}
      className="order-last line-clamp-2 w-full text-sm text-text-muted md:order-none md:line-clamp-1 md:w-auto md:min-w-0 md:flex-1"
    >
      {description}
    </p>
  );
}

function RowSourceOrPath({ item, sources }: { item: DiscoveredItem; sources?: RowSources }) {
  if (sources) {
    return (
      <SourcePicker
        name={item.name}
        variants={sources.variants}
        chosen={item}
        onChange={sources.onChange}
      />
    );
  }
  return (
    <span
      title={item.path}
      className="hidden max-w-48 shrink-0 truncate font-mono text-xs text-text-muted md:block"
    >
      {item.path}
    </span>
  );
}

function RowBadges({ item, repo }: { item: DiscoveredItem; repo?: RepoSource }) {
  const source = useMemo(
    () => (repo ? { owner: repo.owner, repo: repo.repo, path: item.path } : undefined),
    [repo, item.path],
  );
  const installed = useInstalledEntry({ kind: item.kind, source });
  return (
    <span data-slot="badges" className="flex shrink-0 gap-1.5">
      {installed ? <InstalledBadge status={installed.status} /> : null}
    </span>
  );
}

/** The name button's `::after` stretches over the row so the whole row opens the drawer. */
export function ItemRowLine({
  item,
  repo,
  onOpen,
  selection,
  sources,
  expansion,
  nested,
}: ItemRowLineProps) {
  return (
    <div
      className={`relative flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-surface-soft md:flex-nowrap ${
        nested ? "pl-9" : ""
      }`}
    >
      {selection ? <RowCheckbox item={item} selection={selection} /> : null}
      {expansion ? <ExpandButton name={item.name} expansion={expansion} /> : null}
      <button
        type="button"
        onClick={() => onOpen(item)}
        title={item.name}
        className="min-w-0 max-w-full shrink-0 cursor-pointer truncate rounded text-left font-medium text-text after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:flex-1 md:max-w-[16rem]"
      >
        {item.name}
      </button>
      <RowDescription description={item.description} />
      <RowSourceOrPath item={item} sources={sources} />
      <RowBadges item={item} repo={repo} />
    </div>
  );
}
