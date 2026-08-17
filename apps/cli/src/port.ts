/** Validate and parse a port number (1-65535). Throws on invalid input. */
export function parsePort(value: number | string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}. Port must be an integer between 1 and 65535.`);
  }

  return parsed;
}
