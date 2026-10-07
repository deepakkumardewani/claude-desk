// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { CatalogEnvVar } from "schema";
import { McpEnvVarFields } from "./McpEnvVarFields";

afterEach(cleanup);

const envVars = [
  { key: "API_KEY", label: "API Key", required: true, docsUrl: "https://docs.example/key" },
  { key: "REGION", label: "Region", required: false },
] as unknown as CatalogEnvVar[];

test("placeholder mode shows the env reference, required marker and docs link", () => {
  render(<McpEnvVarFields envVars={envVars} values={{}} onValuesChange={() => {}} />);
  expect(screen.getByText("${API_KEY}")).toBeTruthy();
  expect(screen.getByText("*")).toBeTruthy();
  expect(screen.getByRole("link", { name: "How to get this value" }).getAttribute("href")).toBe(
    "https://docs.example/key",
  );
  expect(screen.getAllByRole("button", { name: "Paste value" })).toHaveLength(2);
});

test("literal mode shows a password input that emits merged values", () => {
  const onValuesChange = vi.fn();
  render(
    <McpEnvVarFields
      envVars={envVars}
      values={{ REGION: "eu" }}
      literalMode={{ API_KEY: true }}
      onValuesChange={onValuesChange}
    />,
  );
  const input = screen.getByPlaceholderText("Enter api key") as HTMLInputElement;
  expect(input.type).toBe("password");
  fireEvent.change(input, { target: { value: "secret" } });
  expect(onValuesChange).toHaveBeenCalledWith({ REGION: "eu", API_KEY: "secret" });
});

test("toggling to literal keeps values; toggling back clears the value", () => {
  const onValuesChange = vi.fn();
  const onLiteralModeChange = vi.fn();
  const { rerender } = render(
    <McpEnvVarFields
      envVars={envVars}
      values={{ API_KEY: "x", REGION: "eu" }}
      onValuesChange={onValuesChange}
      onLiteralModeChange={onLiteralModeChange}
    />,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Paste value" })[0]);
  expect(onLiteralModeChange).toHaveBeenLastCalledWith({ API_KEY: true });
  expect(onValuesChange).not.toHaveBeenCalled();

  rerender(
    <McpEnvVarFields
      envVars={envVars}
      values={{ API_KEY: "x", REGION: "eu" }}
      literalMode={{ API_KEY: true }}
      onValuesChange={onValuesChange}
      onLiteralModeChange={onLiteralModeChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Use env var" }));
  expect(onValuesChange).toHaveBeenCalledWith({ REGION: "eu" });
  expect(onLiteralModeChange).toHaveBeenLastCalledWith({ API_KEY: false });
});

test("toggle works without an onLiteralModeChange handler, and errors are shown", () => {
  render(
    <McpEnvVarFields
      envVars={envVars}
      values={{}}
      onValuesChange={() => {}}
      errors={{ REGION: "required" }}
    />,
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Paste value" })[0]);
  expect(screen.getByText("required")).toBeTruthy();
});
