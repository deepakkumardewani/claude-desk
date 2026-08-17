import { Controller, useFormContext } from "react-hook-form";
import type { ClaudeSettings } from "schema";
import { EditableField, type SchemaField } from "./field-renderers";
import type { FieldErrors } from "react-hook-form";

type SettingsSectionProps = {
  id: string;
  label: string;
  fields: SchemaField[];
  errors: FieldErrors<ClaudeSettings>;
  highlightQuery?: string;
  sectionRef?: (element: HTMLElement | null) => void;
};

function fieldError(errors: FieldErrors<ClaudeSettings>, key: string): string | undefined {
  const error = errors[key as keyof ClaudeSettings];
  if (!error) {
    return undefined;
  }
  return typeof error.message === "string" ? error.message : String(error.message ?? "");
}

export function SettingsSection({
  id,
  label,
  fields,
  errors,
  highlightQuery,
  sectionRef,
}: SettingsSectionProps) {
  const { control } = useFormContext<ClaudeSettings>();

  return (
    <section
      id={id}
      ref={sectionRef}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-6 space-y-5"
    >
      <h3
        id={`${id}-heading`}
        className="font-display text-xl font-semibold tracking-tight text-text"
      >
        {label}{" "}
        <span className="font-sans text-base font-normal text-text-muted">({fields.length})</span>
      </h3>

      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-sm">
        <div className="divide-y divide-border-subtle">
          {fields.map((field) => (
            <Controller
              key={field.key}
              name={field.key as keyof ClaudeSettings}
              control={control}
              render={({ field: controllerField }) => (
                <EditableField
                  field={field}
                  value={controllerField.value}
                  onChange={controllerField.onChange}
                  error={fieldError(errors, field.key)}
                  highlightQuery={highlightQuery}
                />
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
