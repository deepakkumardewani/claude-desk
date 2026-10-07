import { useEffect, useRef } from "react";

type SelectAllRowProps = { total: number; selectedCount: number; onChange: (on: boolean) => void };

/** Tri-state: indeterminate when only some of the visible installable groups are selected. */
export function SelectAllRow({ total, selectedCount, onChange }: SelectAllRowProps) {
  const ref = useRef<HTMLInputElement>(null);
  const all = total > 0 && selectedCount === total;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selectedCount > 0 && !all;
  }, [selectedCount, all]);
  return (
    <label className="flex w-fit cursor-pointer items-center gap-3 px-3 py-2 text-sm text-text-muted">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        disabled={total === 0}
        onChange={() => onChange(!all)}
        className="size-4 accent-accent"
      />
      Select all ({total})
    </label>
  );
}
