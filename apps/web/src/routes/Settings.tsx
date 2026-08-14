import { useEffect, useState } from "react";
import type { ClaudeSettings } from "schema";
import { SettingsForm } from "../components/SettingsForm";
import type { SchemaField } from "../components/field-renderers";
import { fetchSettings, fetchSettingsSchema, updateSettings } from "../lib/api";
import { useWorkspace } from "../lib/scope";
import { SETTINGS_LAYER_LOCAL } from "../lib/workspaceState";

export function Settings() {
  const { workspace, activeScope, projectDir } = useWorkspace();
  const [layer, setLayer] = useState<"project" | "local">("project");
  const settingsScope =
    workspace.kind === "project" && layer === "local" ? SETTINGS_LAYER_LOCAL : activeScope;
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [values, setValues] = useState<ClaudeSettings>({});
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchSettingsSchema(), fetchSettings(settingsScope, projectDir ?? undefined)])
      .then(([schema, settingsResponse]) => {
        if (cancelled) {
          return;
        }
        setFields(schema.fields);
        setValues(settingsResponse.settings as ClaudeSettings);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load settings.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [settingsScope, projectDir]);

  async function handleSubmit(nextValues: ClaudeSettings) {
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const response = await updateSettings(nextValues, settingsScope, projectDir ?? undefined);
      setValues(response.settings as ClaudeSettings);
      setSubmitSuccess("Settings saved.");
    } catch {
      setSubmitError("Unable to save settings. Check your values and try again.");
    }
  }

  if (loading) {
    return <p className="text-text-muted">Loading settings…</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <section className="animate-fade-in -my-8 flex h-[calc(100dvh-4.8125rem)] min-h-0 flex-col gap-4 overflow-hidden py-6">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 pb-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-text">
          Configuration
        </h2>
        <p className="font-mono text-sm text-text-muted">
          settings.json
          <span className="ml-2 font-sans">· {fields.length} options</span>
        </p>
        {workspace.kind === "project" ? (
          <div className="ml-auto inline-flex rounded-lg border border-border-subtle p-0.5">
            <button
              type="button"
              aria-pressed={layer === "project"}
              onClick={() => setLayer("project")}
              className={`rounded-[0.3rem] px-2.5 py-1 text-xs font-medium transition ${
                layer === "project" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
              }`}
            >
              Project
            </button>
            <button
              type="button"
              aria-pressed={layer === "local"}
              onClick={() => setLayer("local")}
              className={`rounded-[0.3rem] px-2.5 py-1 text-xs font-medium transition ${
                layer === "local" ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
              }`}
            >
              Local
            </button>
          </div>
        ) : null}
      </div>

      <SettingsForm
        fields={fields}
        defaultValues={values}
        onSubmit={handleSubmit}
        submitError={submitError}
        submitSuccess={submitSuccess}
        onDismissNotification={() => {
          setSubmitError(null);
          setSubmitSuccess(null);
        }}
      />
    </section>
  );
}
