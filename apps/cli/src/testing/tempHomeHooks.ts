import { afterEach, beforeEach } from "vite-plus/test";
import { createTempHome, type TempHome, type TempHomeOptions } from "./tempHome.js";

/**
 * Gives every test in the surrounding describe/file a fresh temp HOME.
 * Returns a getter because the home changes per test.
 */
export function useTempHome(options?: TempHomeOptions): () => TempHome {
  let current: TempHome | undefined;

  beforeEach(() => {
    current = createTempHome(options);
  });

  afterEach(() => {
    current?.restore();
    current = undefined;
  });

  return () => {
    if (!current) throw new Error("useTempHome: accessed outside a test");
    return current;
  };
}
