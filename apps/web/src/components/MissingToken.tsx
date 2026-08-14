export function MissingToken() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-surface px-6 text-text">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Open Claude Desk from the CLI
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-text-muted">
        This studio must be opened from the CLI (npx / cc-studio). The launch URL contains a session
        token.
      </p>
    </div>
  );
}
