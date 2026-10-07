import { Bone } from "../Skeleton";

const ROW_COUNT = 8;
const TAB_COUNT = 3;
const ROW_KEYS = Array.from({ length: ROW_COUNT }, (_, i) => i);
const TAB_KEYS = Array.from({ length: TAB_COUNT }, (_, i) => i);

function HeaderBones() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-raised p-4 ring-1 ring-border-subtle">
      <Bone className="h-6 w-1/3" />
      <Bone className="h-4 w-2/3" />
      <Bone className="h-4 w-1/2" />
    </div>
  );
}

function RowBones() {
  return (
    <div className="divide-y divide-border-subtle rounded-xl bg-surface-raised ring-1 ring-border-subtle">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-3 px-3 py-3">
          <Bone className="size-4 shrink-0" />
          <Bone className="h-4 w-28 shrink-0" />
          <Bone className="h-4 flex-1" />
          <Bone className="hidden h-4 w-24 shrink-0 md:block" />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the loaded repo layout (header card, tabs, compact rows) so nothing jumps on arrival. */
export function RepoScanSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Scanning repository…</span>
      <HeaderBones />
      <div className="flex gap-2">
        {TAB_KEYS.map((key) => (
          <Bone key={key} className="h-8 w-24" />
        ))}
      </div>
      <RowBones />
    </div>
  );
}
