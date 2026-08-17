import type { ReactNode } from "react";
import { memo } from "react";
import { EnvField } from "./EnvField";
import { FieldDescription } from "./FieldDescription";
import { HighlightText } from "./HighlightText";
import { MarketplacesField } from "./MarketplacesField";
import { PluginsField } from "./PluginsField";
import { SelectDropdown } from "./SelectDropdown";
import { SkillOverridesField } from "./SkillOverridesField";

export type SelectOption = {
  value: string;
  label: string;
};

export type FieldRendererProps = {
  id: string;
  label: string;
  fieldKey?: string;
  description: string;
  value: unknown;
  readOnly?: boolean;
  options?: SelectOption[];
  placeholder?: string;
  error?: string;
  highlightQuery?: string;
  onChange?: (value: unknown) => void;
};

const fieldControlClassName =
  "w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus-visible:border-accent/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

type HeaderProps = {
  id: string;
  label: string;
  fieldKey?: string;
  description?: string;
  highlightQuery?: string;
};

const FieldHeader = memo(function FieldHeader({
  id,
  label,
  fieldKey,
  description,
  highlightQuery,
}: HeaderProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <label htmlFor={id} className="font-medium text-text">
          <HighlightText text={label} query={highlightQuery} />
        </label>
        {fieldKey ? (
          <span className="font-mono text-xs text-text-muted">
            <HighlightText text={fieldKey} query={highlightQuery} />
          </span>
        ) : null}
      </div>
      {description ? <FieldDescription text={description} highlightQuery={highlightQuery} /> : null}
    </div>
  );
});

const ErrorText = memo(function ErrorText({ error }: { error?: string }) {
  if (!error) {
    return null;
  }
  return (
    <p className="text-sm text-danger" role="alert">
      {error}
    </p>
  );
});

/** Short controls: header on the left, control on the right (stacks on narrow screens). */
function InlineField({
  header,
  error,
  children,
}: {
  header: HeaderProps;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-3 px-4 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:items-start">
      <FieldHeader {...header} />
      <div className="space-y-2 md:pt-0.5">
        {children}
        <ErrorText error={error} />
      </div>
    </div>
  );
}

/** Wide controls (textareas, structured editors): header on top, control full-width below. */
export function StackedField({
  header,
  error,
  children,
}: {
  header: HeaderProps;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 px-4 py-4">
      <FieldHeader {...header} />
      {children}
      <ErrorText error={error} />
    </div>
  );
}

const SwitchControl = memo(function SwitchControl({
  id,
  checked,
  readOnly,
  error,
  onChange,
}: {
  id: string;
  checked: boolean;
  readOnly: boolean;
  error?: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`relative inline-flex shrink-0 items-center ${readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        readOnly={readOnly}
        disabled={readOnly}
        aria-readonly={readOnly}
        aria-invalid={error ? true : undefined}
        onChange={
          readOnly
            ? undefined
            : (event) => {
                onChange?.(event.target.checked);
              }
        }
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="h-6 w-11 rounded-full border border-border-subtle bg-surface transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface-raised"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-surface-raised shadow-sm transition-transform peer-checked:translate-x-5"
      />
    </label>
  );
});

export function ToggleField({
  id,
  label,
  fieldKey,
  description,
  value,
  readOnly = true,
  error,
  highlightQuery,
  onChange,
}: FieldRendererProps) {
  const checked = Boolean(value);

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-6">
        <FieldHeader
          id={id}
          label={label}
          fieldKey={fieldKey}
          description={description}
          highlightQuery={highlightQuery}
        />
        <div className="pt-0.5">
          <SwitchControl
            id={id}
            checked={checked}
            readOnly={readOnly}
            error={error}
            onChange={(next) => onChange?.(next)}
          />
        </div>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  fieldKey,
  description,
  value,
  options = [],
  readOnly = true,
  error,
  highlightQuery,
  onChange,
}: FieldRendererProps) {
  const selected = typeof value === "string" || typeof value === "number" ? String(value) : "";

  return (
    <InlineField header={{ id, label, fieldKey, description, highlightQuery }} error={error}>
      <SelectDropdown
        id={id}
        value={selected}
        options={options}
        readOnly={readOnly}
        onChange={(next) => onChange?.(next)}
      />
    </InlineField>
  );
}

export function InputField({
  id,
  label,
  fieldKey,
  description,
  value,
  readOnly = true,
  placeholder,
  error,
  highlightQuery,
  onChange,
}: FieldRendererProps) {
  const displayValue =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";

  return (
    <InlineField header={{ id, label, fieldKey, description, highlightQuery }} error={error}>
      <input
        id={id}
        type="text"
        value={displayValue}
        placeholder={readOnly ? undefined : placeholder}
        readOnly={readOnly}
        disabled={readOnly}
        aria-readonly={readOnly}
        aria-invalid={error ? true : undefined}
        onChange={
          readOnly
            ? undefined
            : (event) => {
                const next = event.target.value;
                onChange?.(next === "" ? undefined : next);
              }
        }
        className={fieldControlClassName}
      />
    </InlineField>
  );
}

export function JsonField({
  id,
  label,
  fieldKey,
  description,
  value,
  readOnly = true,
  placeholder,
  error,
  highlightQuery,
  onChange,
}: FieldRendererProps) {
  const displayValue =
    value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return (
    <StackedField header={{ id, label, fieldKey, description, highlightQuery }} error={error}>
      <textarea
        id={id}
        value={displayValue}
        placeholder={readOnly ? undefined : placeholder}
        readOnly={readOnly}
        disabled={readOnly}
        aria-readonly={readOnly}
        aria-invalid={error ? true : undefined}
        rows={Math.min(14, Math.max(4, displayValue.split("\n").length + 1))}
        onChange={
          readOnly
            ? undefined
            : (event) => {
                const next = event.target.value.trim();
                if (next === "") {
                  onChange?.(undefined);
                  return;
                }
                try {
                  onChange?.(JSON.parse(next));
                } catch {
                  onChange?.(next);
                }
              }
        }
        className={`${fieldControlClassName} font-mono text-xs leading-relaxed`}
      />
    </StackedField>
  );
}

export type SchemaField = {
  key: string;
  label: string;
  description: string;
  control: "toggle" | "select" | "input" | "json";
  group: string;
  options?: SelectOption[];
  placeholder?: string;
};

const CUSTOM_EDITORS: Record<
  string,
  (props: { value: unknown; onChange: (value: unknown) => void }) => ReactNode
> = {
  enabledPlugins: PluginsField,
  extraKnownMarketplaces: MarketplacesField,
  env: EnvField,
  skillOverrides: SkillOverridesField,
};

export function EditableField({
  field,
  value,
  onChange,
  error,
  highlightQuery,
}: {
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  highlightQuery?: string;
}) {
  const id = `setting-${field.key}`;
  const header = {
    id,
    label: field.label,
    fieldKey: field.key,
    description: field.description,
    highlightQuery,
  };

  const CustomEditor = CUSTOM_EDITORS[field.key];
  if (CustomEditor) {
    return (
      <StackedField header={header} error={error}>
        <CustomEditor value={value} onChange={onChange} />
      </StackedField>
    );
  }

  const props = {
    id,
    label: field.label,
    fieldKey: field.key,
    description: field.description,
    value,
    options: field.options,
    placeholder: field.placeholder,
    readOnly: false,
    error,
    highlightQuery,
    onChange,
  };

  switch (field.control) {
    case "toggle":
      return <ToggleField {...props} />;
    case "select":
      return <SelectField {...props} />;
    case "json":
      return <JsonField {...props} />;
    default:
      return <InputField {...props} />;
  }
}

export function ReadOnlyField({ field, value }: { field: SchemaField; value: unknown }) {
  const props = {
    id: `setting-${field.key}`,
    label: field.label,
    fieldKey: field.key,
    description: field.description,
    value,
    options: field.options,
    readOnly: true,
  };

  switch (field.control) {
    case "toggle":
      return <ToggleField {...props} />;
    case "select":
      return <SelectField {...props} />;
    case "json":
      return <JsonField {...props} />;
    default:
      return <InputField {...props} />;
  }
}
