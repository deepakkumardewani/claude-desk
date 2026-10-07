import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { fetchContextDetails } from "./context";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../lib/sessionApi", () => ({ apiFetch }));

function reply(body: unknown, ok = true) {
  apiFetch.mockImplementation(async () => ({ ok, json: async () => body }));
}

beforeEach(() => {
  apiFetch.mockReset();
});
afterEach(() => vi.restoreAllMocks());

test("requests user scope by default without projectDir", async () => {
  reply({ success: true, model: "m" });
  const result = await fetchContextDetails();
  expect(apiFetch).toHaveBeenCalledWith("/api/context/all?scope=user");
  expect(result).toEqual({ success: true, data: { success: true, model: "m" } });
});

test("includes project scope and projectDir", async () => {
  reply({ success: true });
  await fetchContextDetails("project", "/a b");
  expect(apiFetch).toHaveBeenCalledWith("/api/context/all?scope=project&projectDir=%2Fa+b");
});

test("returns the server error when response is not ok", async () => {
  reply({ success: false, error: "boom" }, false);
  expect(await fetchContextDetails()).toEqual({ success: false, error: "boom" });
});

test("falls back to a generic error when none is provided", async () => {
  reply({ success: false }, true);
  expect(await fetchContextDetails()).toEqual({ success: false, error: "Failed to fetch" });
});

test("maps thrown Errors and non-Errors to messages", async () => {
  apiFetch.mockRejectedValueOnce(new Error("offline"));
  expect(await fetchContextDetails()).toEqual({ success: false, error: "offline" });
  apiFetch.mockRejectedValueOnce("nope");
  expect(await fetchContextDetails()).toEqual({
    success: false,
    error: "Failed to fetch context details",
  });
});
