/** Validate and parse a port. `0` means OS-assigned ephemeral port. */
export function parsePort(value: number | string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}. Port must be an integer between 0 and 65535.`);
  }

  return parsed;
}
