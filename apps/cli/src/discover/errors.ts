/** Every error code the Discover API can surface (spec §5). */
export type DiscoverErrorCode =
  | "BAD_INPUT"
  | "SHORT_QUERY"
  | "REPO_NOT_FOUND"
  | "RATE_LIMITED"
  | "GITHUB_UNREACHABLE"
  | "NOT_TEXT"
  | "SKILLS_SH_UNREACHABLE"
  | "SKILLS_SH_SCHEMA"
  | "SKILL_NOT_FOUND"
  | "PLAN_CHANGED"
  | "ACK_REQUIRED"
  | "LOCALLY_MODIFIED"
  | "INSTALL_NOT_FOUND";

export class DiscoverError extends Error {
  readonly code: DiscoverErrorCode;
  /** Extra context for route mapping (e.g. rate-limit reset time). Never contains secrets. */
  readonly details?: Record<string, unknown>;

  constructor(code: DiscoverErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DiscoverError";
    this.code = code;
    this.details = details;
  }
}

export type Result<T, E = DiscoverError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
