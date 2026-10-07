// Copy to e2e/<area>.spec.ts. One test() per scenario in e2e/scenarios/<area>.feature.md,
// with the title copied verbatim (checked by `vp run e2e:check`).
// - Read-only specs run in parallel (default). Specs that mutate the temp HOME call
//   `test.describe.configure({ mode: "serial" })` and `test.beforeAll(resetHome)`.
// - Expect console noise? Declare it per test with `allowExpectedConsoleError(/pattern/)`.
import { expect, test } from "../fixtures/index.js";

test.describe("<area>", () => {
  test("<scenario title, identical to the .feature.md>", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /~\/\.claude/ })).toBeVisible();
  });
});
