/**
 * Shared loading / error / empty state blocks reused across all Usage tabs.
 */

export function LoadingBlock({ label = "Loading usage data..." }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-[84px] animate-pulse rounded-lg border border-border-subtle bg-surface-raised"
          />
        ))}
      </div>
      <div
        className="h-48 animate-pulse rounded-lg border border-border-subtle bg-surface-raised"
        aria-hidden="true"
      />
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200"
    >
      <p className="text-sm font-semibold">Error loading usage data</p>
      <p className="mt-0.5 text-sm">{message}</p>
    </div>
  );
}

export function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-soft/60 px-4 py-3">
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}
