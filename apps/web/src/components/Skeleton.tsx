/** A single placeholder shape for loading skeletons. Size and shape come from `className`. */
export function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-border-subtle motion-reduce:animate-none ${className}`}
    />
  );
}
