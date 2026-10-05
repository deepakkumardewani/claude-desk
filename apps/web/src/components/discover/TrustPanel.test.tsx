// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrustFinding } from "schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TrustPanel } from "./TrustPanel";

const f = (
  partial: Partial<TrustFinding> & Pick<TrustFinding, "severity" | "rule">,
): TrustFinding => ({
  itemId: "a",
  message: `${partial.rule} message`,
  ...partial,
});

afterEach(cleanup);

describe("TrustPanel", () => {
  it("renders no ack checkbox without danger findings and allows apply", () => {
    const onCanApplyChange = vi.fn();
    render(
      <TrustPanel
        findings={[
          f({ severity: "caution", rule: "network", file: "a.sh", line: 2, evidence: "curl x" }),
          f({
            severity: "info",
            rule: "token-cost",
            message: "Always-loaded description costs ~26 tokens",
          }),
        ]}
        itemNames={{ a: "My Skill" }}
        onCanApplyChange={onCanApplyChange}
      />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("My Skill")).toBeTruthy();
    expect(screen.getByText("a.sh:2")).toBeTruthy();
    expect(screen.getByText("2: curl x")).toBeTruthy();
    expect(screen.getByTestId("token-cost").textContent).toContain("~26 tokens");
    expect(onCanApplyChange).toHaveBeenLastCalledWith(true);
  });

  it("requires the ack checkbox when a danger finding exists and reports the gate", () => {
    const onCanApplyChange = vi.fn();
    render(
      <TrustPanel
        findings={[
          f({ severity: "danger", rule: "hidden-unicode", line: 1, evidence: "<U+202E>" }),
        ]}
        onCanApplyChange={onCanApplyChange}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "I've reviewed these findings" });
    expect(onCanApplyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(box);
    expect(onCanApplyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(box);
    expect(onCanApplyChange).toHaveBeenLastCalledWith(false);
  });

  it("groups findings per item and lists danger first", () => {
    render(
      <TrustPanel
        findings={[
          f({ severity: "info", rule: "allowed-tools" }),
          f({ severity: "danger", rule: "pipe-to-shell" }),
          f({ severity: "caution", rule: "network", itemId: "b" }),
        ]}
      />,
    );
    expect(screen.getAllByTestId("trust-item")).toHaveLength(2);
    const rows = screen.getAllByTestId("trust-item")[0].querySelectorAll("li");
    expect(rows[0].getAttribute("data-severity")).toBe("danger");
  });
});
