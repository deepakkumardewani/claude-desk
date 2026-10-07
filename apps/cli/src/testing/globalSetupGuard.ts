import { describeDiff, diffSnapshots, snapshotRealHome } from "./realHomeGuard.js";

/** Vitest globalSetup: fails the run if any test left a trace in the real home. */
export default function setup(): () => void {
  const before = snapshotRealHome();
  return () => {
    const diff = diffSnapshots(before, snapshotRealHome());
    const summary = describeDiff(diff);
    if (summary) {
      // Vitest only logs a throwing teardown; the exit code must carry the failure.
      process.exitCode = 1;
      throw new Error(`Real home changed during the test run:\n${summary}`);
    }
  };
}
