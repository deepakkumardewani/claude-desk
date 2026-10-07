// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { Settings } from "./Settings";

const api = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  fetchSettingsSchema: vi.fn(),
  updateSettings: vi.fn(),
}));
const workspace = vi.hoisted(() => ({
  current: {
    workspace: { kind: "user" },
    activeScope: "user",
    projectDir: null,
  } as Record<string, unknown>,
}));
const form = vi.hoisted(() => ({ props: {} as Record<string, any> }));

vi.mock("../lib/api", () => api);
vi.mock("../lib/scope", () => ({ useWorkspace: () => workspace.current }));
vi.mock("../components/SettingsForm", () => ({
  SettingsForm: (props: Record<string, any>) => {
    form.props = props;
    return (
      <div>
        <span data-testid="values">{JSON.stringify(props.defaultValues)}</span>
        <span data-testid="submit-error">{props.submitError ?? ""}</span>
        <span data-testid="submit-success">{props.submitSuccess ?? ""}</span>
        <button onClick={() => props.onSubmit({ model: "opus" })}>submit</button>
        <button onClick={props.onDismissNotification}>dismiss</button>
      </div>
    );
  },
}));

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.fetchSettingsSchema.mockResolvedValue({ fields: [{ key: "a" }, { key: "b" }] });
  api.fetchSettings.mockResolvedValue({ settings: { theme: "dark" } });
  workspace.current = { workspace: { kind: "user" }, activeScope: "user", projectDir: null };
});
afterEach(cleanup);

test("loads schema and settings for the user scope and renders the option count", async () => {
  render(<Settings />);
  expect(screen.getByText("Loading settings…")).toBeTruthy();
  expect(await screen.findByText("· 2 options")).toBeTruthy();
  expect(api.fetchSettings).toHaveBeenCalledWith("user", undefined);
  expect(screen.getByTestId("values").textContent).toBe('{"theme":"dark"}');
  expect(screen.queryByRole("button", { name: "Local" })).toBeNull();
});

test("shows an error when loading fails", async () => {
  api.fetchSettings.mockRejectedValue(new Error("x"));
  render(<Settings />);
  expect(await screen.findByText("Unable to load settings.")).toBeTruthy();
});

test("saving sends the form values with scope and updates the displayed values", async () => {
  api.updateSettings.mockResolvedValue({ settings: { model: "opus" } });
  render(<Settings />);
  fireEvent.click(await screen.findByText("submit"));
  await waitFor(() =>
    expect(screen.getByTestId("submit-success").textContent).toBe("Settings saved."),
  );
  expect(api.updateSettings).toHaveBeenCalledWith({ model: "opus" }, "user", undefined);
  expect(screen.getByTestId("values").textContent).toBe('{"model":"opus"}');
  expect(screen.getByTestId("submit-error").textContent).toBe("");
});

test("a failed save shows the validation message, and dismiss clears notifications", async () => {
  api.updateSettings.mockRejectedValue(new Error("422"));
  render(<Settings />);
  fireEvent.click(await screen.findByText("submit"));
  await waitFor(() =>
    expect(screen.getByTestId("submit-error").textContent).toBe(
      "Unable to save settings. Check your values and try again.",
    ),
  );
  expect(screen.getByTestId("submit-success").textContent).toBe("");
  fireEvent.click(screen.getByText("dismiss"));
  expect(screen.getByTestId("submit-error").textContent).toBe("");
});

test("project workspaces expose Project/Local layers that change the scope used", async () => {
  workspace.current = {
    workspace: { kind: "project", dir: "/p" },
    activeScope: "project",
    projectDir: "/p",
  };
  api.updateSettings.mockResolvedValue({ settings: {} });
  render(<Settings />);
  await screen.findByText("· 2 options");
  expect(api.fetchSettings).toHaveBeenLastCalledWith("project", "/p");
  expect(screen.getByRole("button", { name: "Project" }).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Local" }));
  await waitFor(() => expect(api.fetchSettings).toHaveBeenLastCalledWith("projectLocal", "/p"));
  expect(screen.getByRole("button", { name: "Local" }).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(await screen.findByText("submit"));
  await waitFor(() =>
    expect(api.updateSettings).toHaveBeenCalledWith({ model: "opus" }, "projectLocal", "/p"),
  );

  fireEvent.click(screen.getByRole("button", { name: "Project" }));
  await waitFor(() => expect(api.fetchSettings).toHaveBeenLastCalledWith("project", "/p"));
});
