import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { StatusResponse, StatusItem } from "schema";

function StatusIcon({ status }: { status: "ok" | "warn" | "missing" }) {
  if (status === "ok") {
    return (
      <svg className="size-5 text-success" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (status === "warn") {
    return (
      <svg className="size-5 text-warning" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg className="size-5 text-danger" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface SetupStatusProps {
  compact?: boolean;
}

export function SetupStatus({ compact = false }: SetupStatusProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/status")
      .then((res) => res.json())
      .then((data: StatusResponse) => {
        if (!cancelled) {
          setStatus(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError("Unable to load setup status");
          console.error("Error fetching status:", err);
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
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 animate-pulse">
        <div className="h-4 w-24 rounded bg-border-subtle" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!status) {
    return null;
  }

  if (compact && status.allOk) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 flex items-center gap-2 text-sm text-text">
        <StatusIcon status="ok" />
        <span>All setup checks passed</span>
      </div>
    );
  }

  if (compact) {
    const nonOkCount = status.items.filter((item: StatusItem) => item.status !== "ok").length;
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-3">
        <Link
          to="/settings"
          className="flex items-center gap-2 text-sm text-warning hover:text-warning/80 transition"
        >
          <StatusIcon status="warn" />
          <span>{nonOkCount} setup check(s) need attention</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-raised overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-sm font-semibold text-text">Setup Status</h3>
      </div>
      <div className="divide-y divide-border-subtle">
        {status.items.map((item: StatusItem) => (
          <div key={item.id} className="px-4 py-3 flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0">
              <StatusIcon status={item.status} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-medium text-text">{item.label}</p>
                <p className="text-xs text-text-muted">{item.message}</p>
              </div>
              {item.fixRoute && item.status !== "ok" && (
                <Link
                  to={item.fixRoute}
                  className="mt-1 text-xs font-medium text-accent hover:opacity-80 transition"
                >
                  Fix →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
