import { useCallback, useMemo, useState } from "react";
import type { DiscoveredItem } from "schema";
import { preferredVariant, type ItemGroup } from "../../lib/discover/variants";

const isInstallable = (item: DiscoveredItem) => item.installable !== false;

/**
 * Selection of merged groups plus the source copy chosen for each.
 * The chosen copy is kept apart from "selected" so picking a source before ticking the box sticks.
 */
export function useGroupSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(new Map());

  const variantFor = useCallback(
    (group: ItemGroup): DiscoveredItem =>
      group.variants.find((v) => v.id === chosen.get(group.key)) ?? preferredVariant(group),
    [chosen],
  );

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const setMany = useCallback((keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const chooseSource = useCallback((key: string, variantId: string) => {
    setChosen((prev) => new Map(prev).set(key, variantId));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  /** groupKey → variant id, limited to groups whose chosen copy can actually be installed. */
  const selectionFor = useCallback(
    (groups: ItemGroup[]) => {
      const selection = new Map<string, string>();
      for (const group of groups) {
        const variant = variantFor(group);
        if (selected.has(group.key) && isInstallable(variant)) selection.set(group.key, variant.id);
      }
      return selection;
    },
    [selected, variantFor],
  );

  return useMemo(
    () => ({ selected, variantFor, toggle, setMany, chooseSource, clear, selectionFor }),
    [selected, variantFor, toggle, setMany, chooseSource, clear, selectionFor],
  );
}
