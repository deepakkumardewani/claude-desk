import type { CatalogEnvVar } from "schema";

interface McpEnvVarFieldsProps {
  /**
   * Environment variables to render fields for.
   */
  envVars: readonly CatalogEnvVar[];
  /**
   * Current values (key -> value).
   */
  values: Record<string, string>;
  /**
   * Called when any value changes.
   */
  onValuesChange: (values: Record<string, string>) => void;
  /**
   * Track which fields are in literal mode vs placeholder.
   */
  literalMode?: Record<string, boolean>;
  /**
   * Called when literal mode toggle is clicked.
   */
  onLiteralModeChange?: (mode: Record<string, boolean>) => void;
  /**
   * Validation errors by key.
   */
  errors?: Record<string, string>;
}

export function McpEnvVarFields({
  envVars,
  values,
  onValuesChange,
  literalMode = {},
  onLiteralModeChange,
  errors = {},
}: McpEnvVarFieldsProps) {
  const handleValueChange = (key: string, newValue: string) => {
    const updated = { ...values, [key]: newValue };
    onValuesChange(updated);
  };

  const handleToggleLiteralMode = (key: string) => {
    const newMode = { ...literalMode, [key]: !literalMode[key] };
    // When switching back to placeholder, clear the value
    if (literalMode[key]) {
      const updated = { ...values };
      delete updated[key];
      onValuesChange(updated);
    }
    onLiteralModeChange?.(newMode);
  };

  return (
    <div className="space-y-4">
      {envVars.map((envVar) => {
        const isLiteral = literalMode[envVar.key] ?? false;
        const value = values[envVar.key] ?? "";
        const error = errors[envVar.key];

        return (
          <div key={envVar.key}>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-text">
                {envVar.label}
                {envVar.required ? <span className="text-danger ml-1">*</span> : null}
              </label>
              <button
                type="button"
                onClick={() => handleToggleLiteralMode(envVar.key)}
                className="text-xs text-text-muted hover:text-text transition"
              >
                {isLiteral ? "Use env var" : "Paste value"}
              </button>
            </div>

            {!isLiteral ? (
              <div className="mt-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-muted">
                <code>{`\${${envVar.key}}`}</code>
                <p className="mt-1 text-xs text-text-muted">Reads from your shell environment</p>
              </div>
            ) : (
              <input
                type="password"
                value={value}
                onChange={(e) => handleValueChange(envVar.key, e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text"
                placeholder={`Enter ${envVar.label.toLowerCase()}`}
              />
            )}

            {error && <p className="mt-1 text-xs text-danger">{error}</p>}

            {envVar.docsUrl && (
              <a
                href={envVar.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-accent hover:underline"
              >
                How to get this value
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
