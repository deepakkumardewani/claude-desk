import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SelectOption } from "./field-renderers";
import { ChevronDownIcon, CheckIcon } from "./icons";

type SelectDropdownProps = {
  id: string;
  value: string;
  options: SelectOption[];
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
};

export function SelectDropdown({
  id,
  value,
  options,
  readOnly = false,
  onChange,
}: SelectDropdownProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const allOptions = useMemo<SelectOption[]>(
    () => [{ value: "", label: "Not set" }, ...options],
    [options],
  );
  const selectedIndex = allOptions.findIndex((option) => option.value === value);
  const displayLabel = allOptions[selectedIndex]?.label ?? "Not set";

  function optionId(index: number): string {
    return `${listboxId}-option-${index}`;
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
    // selectedIndex intentionally excluded: only re-run when the list opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

  function selectOption(nextValue: string) {
    onChange?.(nextValue === "" ? undefined : nextValue);
    setOpen(false);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (readOnly) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (open) {
          setHighlightedIndex((current) => Math.min(current + 1, allOptions.length - 1));
        } else {
          setOpen(true);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (open) {
          setHighlightedIndex((current) => Math.max(current - 1, 0));
        } else {
          setOpen(true);
        }
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setHighlightedIndex(allOptions.length - 1);
        }
        break;
      case "Enter":
      case " ":
        if (open) {
          event.preventDefault();
          selectOption(allOptions[highlightedIndex]?.value ?? "");
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={readOnly}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? optionId(highlightedIndex) : undefined}
        onClick={() => {
          if (!readOnly) {
            setOpen((current) => !current);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-left text-sm shadow-sm transition hover:border-accent/30 focus-visible:border-accent/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={value ? "text-text" : "text-text-muted"}>{displayLabel}</span>
        <ChevronDownIcon open={open} />
      </button>

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={id}
          className="absolute z-20 mt-1.5 max-h-56 w-full overflow-auto rounded-lg border border-border-subtle bg-surface-raised py-1 shadow-lg"
        >
          {allOptions.map((option, index) => {
            const isSelected = index === selectedIndex;
            const isHighlighted = index === highlightedIndex;

            return (
              <li
                key={option.value || "__unset__"}
                id={optionId(index)}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(option.value)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition ${
                  isSelected
                    ? "bg-accent/10 font-medium text-accent"
                    : isHighlighted
                      ? "bg-surface-soft text-text"
                      : option.value === ""
                        ? "text-text-muted"
                        : "text-text"
                }`}
              >
                <span>{option.label}</span>
                {isSelected ? <CheckIcon /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
