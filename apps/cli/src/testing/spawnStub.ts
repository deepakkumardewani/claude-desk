import { EventEmitter } from "node:events";

export type SpawnScript = {
  stdout?: string;
  stderr?: string;
  /** Exit code delivered on `close`; defaults to 0. */
  code?: number;
  /** When set, the child emits `error` (e.g. ENOENT) instead of running. */
  error?: Error;
};

export type SpawnCall = { command: string; args: readonly string[]; options: unknown };

export class UnexpectedSpawnError extends Error {
  constructor(command: string) {
    super(`spawnStub: unexpected command "${command}"`);
    this.name = "UnexpectedSpawnError";
  }
}

/**
 * Replacement for `child_process.spawn`. Only `allowedCommand` may be spawned; anything else
 * throws, so a test can never launch a real binary by accident.
 * Usage: `vi.mock("node:child_process", () => ({ spawn: stub.spawn }))` (build the stub in `vi.hoisted`).
 */
export function createSpawnStub(
  respond: SpawnScript | ((call: SpawnCall) => SpawnScript),
  allowedCommand = "claude",
) {
  const calls: SpawnCall[] = [];

  const spawn = (command: string, args: readonly string[] = [], options: unknown = {}) => {
    if (command !== allowedCommand) throw new UnexpectedSpawnError(command);
    const call = { command, args, options };
    calls.push(call);
    const script = typeof respond === "function" ? respond(call) : respond;

    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    // Deliver after the caller has attached its listeners.
    queueMicrotask(() => {
      if (script.error) {
        child.emit("error", script.error);
        return;
      }
      if (script.stdout) child.stdout.emit("data", Buffer.from(script.stdout));
      if (script.stderr) child.stderr.emit("data", Buffer.from(script.stderr));
      child.emit("close", script.code ?? 0);
    });
    return child;
  };

  return { spawn, calls };
}
