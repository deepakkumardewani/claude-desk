// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { Backups } from "./Backups";

const fetchBackups = vi.hoisted(() => vi.fn());
const restoreBackup = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ fetchBackups, restoreBackup }));

const files = [
  {
    path: "/home/u/.claude/settings.json",
    backups: [
      { id: "b1", timestamp: "2026-01-01T00:00:00Z", size: 100 },
      { id: "b2", timestamp: "2026-01-02T00:00:00Z", size: 200 },
    ],
  },
  {
    path: "CLAUDE.md",
    backups: [{ id: "b3", timestamp: "2026-01-03T00:00:00Z", size: 50 }],
  },
];

beforeEach(() => {
  fetchBackups.mockReset();
  restoreBackup.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("shows loading, then the empty state", async () => {
  fetchBackups.mockResolvedValue({ files: [] });
  render(<Backups />);
  expect(screen.getByText("Loading backups…")).toBeTruthy();
  expect(await screen.findByText(/No backups yet/u)).toBeTruthy();
});

test("shows an error when loading fails", async () => {
  fetchBackups.mockRejectedValue(new Error("x"));
  render(<Backups />);
  expect(await screen.findByText("Unable to load backups.")).toBeTruthy();
});

test("lists files with pluralised counts and split path labels", async () => {
  fetchBackups.mockResolvedValue({ files });
  render(<Backups />);
  expect(await screen.findByText("settings.json")).toBeTruthy();
  expect(screen.getByText("2 backups")).toBeTruthy();
  expect(screen.getByText("1 backup")).toBeTruthy();
  expect(screen.getByText("/home/u/.claude/")).toBeTruthy();
  expect(screen.getByText("CLAUDE.md")).toBeTruthy();
});

test("expanding a file shows its backups; expanding another collapses the first; toggling closes", async () => {
  fetchBackups.mockResolvedValue({ files });
  render(<Backups />);
  const first = await screen.findByRole("button", { name: /settings\.json/u });
  const second = screen.getByRole("button", { name: /CLAUDE\.md/u });
  fireEvent.click(first);
  expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  expect(first.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(second);
  expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(1);
  fireEvent.click(second);
  expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
});

test("restoring confirms first, calls the API with id and path, then refetches", async () => {
  fetchBackups.mockResolvedValue({ files });
  restoreBackup.mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<Backups />);
  fireEvent.click(await screen.findByRole("button", { name: /CLAUDE\.md/u }));
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith("b3", "CLAUDE.md"));
  expect(confirm).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(fetchBackups).toHaveBeenCalledTimes(2));
});

test("declining the confirmation neither restores nor refetches", async () => {
  fetchBackups.mockResolvedValue({ files });
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Backups />);
  fireEvent.click(await screen.findByRole("button", { name: /CLAUDE\.md/u }));
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy());
  expect(restoreBackup).not.toHaveBeenCalled();
  expect(fetchBackups).toHaveBeenCalledTimes(1);
});

test("a failed refresh after restore is logged and keeps the list", async () => {
  fetchBackups.mockResolvedValueOnce({ files });
  fetchBackups.mockRejectedValueOnce(new Error("refresh failed"));
  restoreBackup.mockResolvedValue(undefined);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Backups />);
  fireEvent.click(await screen.findByRole("button", { name: /CLAUDE\.md/u }));
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(log).toHaveBeenCalled());
  expect(screen.getByText("CLAUDE.md")).toBeTruthy();
});
