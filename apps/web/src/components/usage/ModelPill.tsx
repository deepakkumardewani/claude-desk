/**
 * Small outlined pill for a model id, colored by model family so scanning a
 * table of mixed models (opus/sonnet/haiku/fable) is fast at a glance.
 */
const FAMILY_CLASSES: Record<string, string> = {
  opus: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  sonnet: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  haiku: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fable: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};
const DEFAULT_CLASSES = "border-border-subtle bg-surface-soft text-text-muted";

function familyClasses(model: string): string {
  const lower = model.toLowerCase();
  for (const [family, classes] of Object.entries(FAMILY_CLASSES)) {
    if (lower.includes(family)) return classes;
  }
  return DEFAULT_CLASSES;
}

export function ModelPill({ model, className = "" }: { model: string; className?: string }) {
  const label = model.replace(/^claude-/, "");
  return (
    <span
      title={model}
      className={`inline-flex max-w-full items-center truncate rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${familyClasses(model)} ${className}`}
    >
      {label}
    </span>
  );
}
