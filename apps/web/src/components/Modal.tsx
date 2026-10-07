import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ModalSize = "md" | "lg";

const MODAL_WIDTH_CLASS: Record<ModalSize, string> = {
  md: "max-w-lg",
  lg: "max-w-2xl",
};

/** Accessible modal rendered into document.body so it escapes scroll/overflow containers. */
export function Modal({
  title,
  onClose,
  children,
  headerAction,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerAction?: ReactNode;
  size?: ModalSize;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    return () => previouslyFocused.current?.focus();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.contains(document.activeElement)) {
      return;
    }
    const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog).focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`mt-14 flex max-h-[80vh] w-full ${MODAL_WIDTH_CLASS[size]} flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-lg outline-none sm:mt-0`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <h2 className="min-w-0 break-words font-display text-base font-semibold text-text">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {headerAction}
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-md text-text-muted transition hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg
                aria-hidden="true"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
