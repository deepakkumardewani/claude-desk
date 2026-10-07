import type { ItemKind } from "schema";
import { getItemKindColor } from "../../lib/categoryColors";
import { KIND_LABELS, KIND_ORDER } from "./itemKinds";

type SelectionDockProps = {
  counts: ReadonlyMap<ItemKind, number>;
  activeKind: ItemKind;
  onSelectKind: (kind: ItemKind) => void;
  onClear: () => void;
  onInstall: () => void;
};

/** Floating pill, `sticky` (not `fixed`) so it centres in the content column beside the sidebar. */
export function SelectionDock({
  counts,
  activeKind,
  onSelectKind,
  onClear,
  onInstall,
}: SelectionDockProps) {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return (
    <div
      data-testid="selection-dock"
      className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full items-center gap-2 rounded-full bg-surface py-1.5 pl-3 pr-1.5 shadow-xl ring-1 ring-accent/40 transition duration-200 ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none"
    >
      <div aria-live="polite" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
        {KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-current={kind === activeKind ? "true" : undefined}
            onClick={() => onSelectKind(kind)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: getItemKindColor(kind) }}
            />
            {KIND_LABELS[kind]} {counts.get(kind)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 cursor-pointer rounded px-1 text-sm text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onInstall}
        className="shrink-0 cursor-pointer rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Install {total}
      </button>
    </div>
  );
}
