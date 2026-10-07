import type { ItemKind } from "schema";
import { KindTabs } from "./KindTabs";

type ItemBrowserToolbarProps = {
  kinds: ItemKind[];
  counts: ReadonlyMap<ItemKind, number>;
  activeKind: ItemKind;
  onKindChange: (kind: ItemKind) => void;
  text: string;
  onTextChange: (text: string) => void;
};

export function ItemBrowserToolbar({
  kinds,
  counts,
  activeKind,
  onKindChange,
  text,
  onTextChange,
}: ItemBrowserToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <KindTabs kinds={kinds} counts={counts} active={activeKind} onChange={onKindChange} />
      <input
        type="search"
        aria-label="Filter items"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="Filter by name or description"
        className="ml-auto w-full rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-text sm:w-64"
      />
    </div>
  );
}
