// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { BackupList } from "./BackupList";

const restoreBackup = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ restoreBackup }));

const backups = [
  { id: "b1", path: "/b1", timestamp: "2026-01-02T03:04:05Z", size: 512 },
  { id: "b2", path: "/b2", timestamp: "2026-01-03T03:04:05Z", size: 2048 },
];

beforeEach(() => {
  restoreBackup.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("shows empty state", () => {
  render(<BackupList filePath="/f" backups={[]} />);
  expect(screen.getByText("No backups for this file.")).toBeTruthy();
});

test("formats sizes in bytes and kilobytes", () => {
  render(<BackupList filePath="/f" backups={backups} />);
  expect(screen.getByText("512 B")).toBeTruthy();
  expect(screen.getByText("2.0 KB")).toBeTruthy();
});

test("does nothing when the confirmation is declined", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<BackupList filePath="/f" backups={backups} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2));
  expect(restoreBackup).not.toHaveBeenCalled();
});

test("restores with id and file path then notifies the parent", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  restoreBackup.mockResolvedValue(undefined);
  const onRestore = vi.fn();
  render(<BackupList filePath="/f" backups={backups} onRestore={onRestore} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[1]);
  expect(await screen.findByText(/^Restored backup from/u)).toBeTruthy();
  expect(restoreBackup).toHaveBeenCalledWith("b2", "/f");
  expect(onRestore).toHaveBeenCalledTimes(1);
});

test("shows an error message from a failed restore, and a fallback for non-errors", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  restoreBackup.mockRejectedValueOnce(new Error("disk full"));
  render(<BackupList filePath="/f" backups={backups} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);
  expect(await screen.findByText("Failed to restore backup: disk full")).toBeTruthy();

  restoreBackup.mockRejectedValueOnce("x");
  fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);
  expect(await screen.findByText("Failed to restore backup: Unknown error")).toBeTruthy();
});

test("disables every button while a restore is in flight", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  let release: () => void = () => {};
  restoreBackup.mockImplementation(() => new Promise<void>((r) => (release = r)));
  render(<BackupList filePath="/f" backups={backups} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);
  expect(await screen.findByRole("button", { name: "Restoring…" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Restore" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  release();
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2));
});
