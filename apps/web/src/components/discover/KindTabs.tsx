import type { KeyboardEvent } from "react";
import type { ItemKind } from "schema";
import { getItemKindColor } from "../../lib/categoryColors";
import { KIND_LABELS } from "./itemKinds";

type KindTabsProps = {
  kinds: ItemKind[];
  counts: ReadonlyMap<ItemKind, number>;
  active: ItemKind;
  onChange: (kind: ItemKind) => void;
};

/** Exactly one kind is active; counts are merged groups, not raw copies. */
export function KindTabs({ kinds, counts, active, onChange }: KindTabsProps) {
  function handleKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = kinds[(index + step + kinds.length) % kinds.length];
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <div role="tablist" aria-label="Filter by kind" className="flex flex-wrap gap-1">
      {kinds.map((kind, index) => {
        const isActive = kind === active;
        return (
          <button
            key={kind}
            id={tabId(kind)}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(kind)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive
                ? "bg-surface-raised text-text ring-1 ring-border-subtle"
                : "text-text-muted hover:text-text"
            }`}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: getItemKindColor(kind) }}
            />
            {KIND_LABELS[kind]} {counts.get(kind)}
          </button>
        );
      })}
    </div>
  );
}

export function tabId(kind: ItemKind): string {
  return `kind-tab-${kind}`;
}
