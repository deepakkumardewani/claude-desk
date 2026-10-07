import type { DiscoveredItem } from "schema";
import { sourceRoot, variantsIdentical } from "../../lib/discover/variants";
import { ChevronDownIcon } from "../icons";

type SourcePickerProps = {
  name: string;
  variants: DiscoveredItem[];
  chosen: DiscoveredItem;
  onChange: (variantId: string) => void;
};

function optionLabel(variant: DiscoveredItem, chosen: DiscoveredItem): string {
  const root = sourceRoot(variant.path);
  if (variant.id === chosen.id) return root;
  return variantsIdentical(variant, chosen) ? `${root} · identical` : root;
}

/** Lets the user pick which copy of a merged item to preview and install. */
export function SourcePicker({ name, variants, chosen, onChange }: SourcePickerProps) {
  return (
    <span className="relative z-10 inline-flex shrink-0 items-center gap-1.5">
      <span className="relative inline-flex items-center">
        <select
          aria-label={`Source for ${name}`}
          value={chosen.id}
          onChange={(event) => onChange(event.target.value)}
          className="cursor-pointer appearance-none rounded-md bg-surface py-0.5 pl-2 pr-6 font-mono text-xs text-text ring-1 ring-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {optionLabel(variant, chosen)}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-1.5">
          <ChevronDownIcon open={false} />
        </span>
      </span>
      <span className="text-xs text-text-muted">+{variants.length - 1}</span>
    </span>
  );
}
