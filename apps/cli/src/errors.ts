/** Check if an error is a file-not-found error. */
export function isFileNotFound(err: unknown): boolean {
  if (err instanceof Error) {
    const error = err as NodeJS.ErrnoException;
    return error.code === "ENOENT";
  }
  return false;
}

/** Error thrown when a file path attempts to escape the allowed directory scope. */
export class PathEscapeError extends Error {
  constructor(message = "path escapes bounds") {
    super(message);
    this.name = "PathEscapeError";
  }
}
