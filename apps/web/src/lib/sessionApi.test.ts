// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { apiFetch, bootstrapToken, getSessionToken } from "./sessionApi";

const fetchMock = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = "";
  vi.stubEnv("VITE_CC_STUDIO_TOKEN", "");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  // Reset module-level token state between tests.
  bootstrapToken();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bootstrapToken", () => {
  it("takes the token from the URL hash, stores it and strips the hash", () => {
    window.location.hash = "#token=abc123";
    expect(bootstrapToken()).toBe("abc123");
    expect(getSessionToken()).toBe("abc123");
    expect(window.sessionStorage.getItem("ccs-token")).toBe("abc123");
    expect(window.location.hash).toBe("");
  });

  it("falls back to session storage when the hash has no token", () => {
    window.sessionStorage.setItem("ccs-token", "stored");
    expect(bootstrapToken()).toBe("stored");
    expect(getSessionToken()).toBe("stored");
  });

  it("prefers the hash over a stored token", () => {
    window.sessionStorage.setItem("ccs-token", "stored");
    window.location.hash = "#token=fresh";
    expect(bootstrapToken()).toBe("fresh");
  });

  it("falls back to the dev env token", () => {
    vi.stubEnv("VITE_CC_STUDIO_TOKEN", "from-env");
    expect(bootstrapToken()).toBe("from-env");
    expect(getSessionToken()).toBe("from-env");
  });

  it("returns an empty string without a token under the test mode", () => {
    expect(bootstrapToken()).toBe("");
    expect(getSessionToken()).toBeNull();
  });

  it("returns null without a token outside the test mode", () => {
    vi.stubEnv("MODE", "production");
    expect(bootstrapToken()).toBeNull();
    expect(getSessionToken()).toBeNull();
  });
});

describe("apiFetch", () => {
  it("attaches the bearer token header", async () => {
    window.location.hash = "#token=tok";
    bootstrapToken();
    await apiFetch("/api/tree", { method: "POST" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tree");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  });

  it("sends no Authorization header when there is no token", async () => {
    await apiFetch("/api/tree");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has("Authorization")).toBe(false);
  });

  it("does not overwrite a caller-supplied Authorization header", async () => {
    window.location.hash = "#token=tok";
    bootstrapToken();
    await apiFetch("/x", { headers: { Authorization: "Bearer custom" } });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization")).toBe(
      "Bearer custom",
    );
  });

  it("returns the fetch response and propagates network failures", async () => {
    const response = new Response("ok");
    fetchMock.mockResolvedValueOnce(response);
    expect(await apiFetch("/x")).toBe(response);
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(apiFetch("/x")).rejects.toThrow("offline");
  });
});
