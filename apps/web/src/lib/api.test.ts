// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  categoryToRoute,
  fetchBackups,
  fetchContext,
  fetchFile,
  fetchMcpServers,
  fetchProjects,
  fetchSettings,
  fetchSettingsSchema,
  fetchSkills,
  fetchTree,
  fetchUsageModels,
  fetchUsageOverview,
  fetchUsagePrompts,
  fetchUsageProjects,
  fetchUsageSessions,
  fetchUsageTimeline,
  fetchUsageWindows,
  fileHref,
  isEditableCategory,
  isRouteSegment,
  restoreBackup,
  routeToCategory,
  saveFile,
  updateSettings,
} from "./api";
import { bootstrapToken } from "./sessionApi";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
  return { url, init, headers: new Headers(init?.headers) };
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = "#token=secret";
  bootstrapToken();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("route/category mapping", () => {
  it("round-trips every route segment", () => {
    for (const segment of [
      "skills",
      "plans",
      "commands",
      "claude-md",
      "settings",
      "agents",
      "plugins",
    ] as const) {
      expect(categoryToRoute(routeToCategory(segment))).toBe(segment);
    }
    expect(routeToCategory("claude-md")).toBe("claudeMd");
  });

  it("recognises only valid route segments", () => {
    expect(isRouteSegment("skills")).toBe(true);
    expect(isRouteSegment("bogus")).toBe(false);
  });

  it("throws for an unknown category", () => {
    expect(() => categoryToRoute("nope" as never)).toThrow("unknown category: nope");
  });

  it("builds file hrefs, encoding each path segment but not singletons", () => {
    expect(fileHref("skills", "my skill/SKILL.md")).toBe("/skills/my%20skill/SKILL.md");
    expect(fileHref("claudeMd", "CLAUDE.md")).toBe("/claude-md");
    expect(fileHref("settings", "settings.json")).toBe("/settings");
  });

  it("reports which categories are editable", () => {
    expect(isEditableCategory("skills")).toBe(true);
    expect(isEditableCategory("claudeMd")).toBe(true);
    expect(isEditableCategory("settings")).toBe(false);
    expect(isEditableCategory("plugins")).toBe(false);
  });
});

describe("GET helpers", () => {
  it("send the bearer token and build scope/projectDir queries", async () => {
    fetchMock.mockImplementation(async () => json({ categories: [] }));
    expect(await fetchTree("project", "/p q")).toEqual({ categories: [] });
    const call = lastCall();
    expect(call.url).toBe("/api/tree?scope=project&projectDir=%2Fp+q");
    expect(call.headers.get("Authorization")).toBe("Bearer secret");
  });

  it("omit projectDir when not given", async () => {
    await fetchTree();
    expect(lastCall().url).toBe("/api/tree?scope=user");
    await fetchSettings();
    expect(lastCall().url).toBe("/api/settings?scope=user");
    await fetchMcpServers("local", "/x");
    expect(lastCall().url).toBe("/api/mcp?scope=local&projectDir=%2Fx");
  });

  it("fetchFile encodes category, name and scope", async () => {
    await fetchFile("skills", "a/b.md", "user");
    expect(lastCall().url).toBe("/api/file?category=skills&name=a%2Fb.md&scope=user");
  });

  it("hit the fixed endpoints", async () => {
    await fetchSettingsSchema();
    expect(lastCall().url).toBe("/api/settings/schema");
    await fetchSkills();
    expect(lastCall().url).toBe("/api/skills");
    await fetchContext();
    expect(lastCall().url).toBe("/api/context");
    await fetchBackups();
    expect(lastCall().url).toBe("/api/backups");
  });

  it("fetchProjects sends extras only when present", async () => {
    await fetchProjects([]);
    expect(lastCall().url).toBe("/api/projects");
    await fetchProjects(["/a", "/b"]);
    expect(lastCall().url).toBe("/api/projects?extra=%2Fa%2C%2Fb");
  });

  it("throw a status error on non-ok responses", async () => {
    fetchMock.mockImplementation(async () => json({}, 401));
    await expect(fetchTree()).rejects.toThrow("request failed: 401");
    await expect(fetchBackups()).rejects.toThrow("request failed: 401");
  });
});

describe("mutations", () => {
  it("saveFile POSTs the content as JSON", async () => {
    fetchMock.mockImplementation(async () => json({ category: "skills", name: "a.md", ok: true }));
    const result = await saveFile("skills", "a.md", "body", "project", "/p");
    expect(result.ok).toBe(true);
    const call = lastCall();
    expect(call.url).toBe("/api/file?category=skills&name=a.md&scope=project&projectDir=%2Fp");
    expect(call.init?.method).toBe("POST");
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(call.init?.body as string)).toEqual({ content: "body" });
  });

  it("saveFile and updateSettings throw on failure", async () => {
    fetchMock.mockImplementation(async () => json({}, 500));
    await expect(saveFile("skills", "a.md", "x")).rejects.toThrow("request failed: 500");
    await expect(updateSettings({})).rejects.toThrow("request failed: 500");
  });

  it("updateSettings PUTs the settings", async () => {
    fetchMock.mockImplementation(async () => json({ settings: { model: "m" } }));
    expect(await updateSettings({ model: "m" })).toEqual({ settings: { model: "m" } });
    const call = lastCall();
    expect(call.url).toBe("/api/settings?scope=user");
    expect(call.init?.method).toBe("PUT");
    expect(JSON.parse(call.init?.body as string)).toEqual({ model: "m" });
  });

  it("restoreBackup POSTs ids and throws on failure", async () => {
    await restoreBackup("b1", "/orig");
    const call = lastCall();
    expect(call.url).toBe("/api/backups/restore");
    expect(JSON.parse(call.init?.body as string)).toEqual({
      backupId: "b1",
      originalPath: "/orig",
    });
    fetchMock.mockImplementation(async () => json({}, 404));
    await expect(restoreBackup("b1", "/o")).rejects.toThrow("request failed: 404");
  });
});

describe("usage helpers", () => {
  it("fetchUsageOverview has no query", async () => {
    await fetchUsageOverview();
    expect(lastCall().url).toBe("/api/usage/overview");
  });

  it("drop undefined and empty query values", async () => {
    await fetchUsageModels();
    expect(lastCall().url).toBe("/api/usage/models");
    await fetchUsageModels({ period: "7d", since: "", until: undefined });
    expect(lastCall().url).toBe("/api/usage/models?period=7d");
  });

  it("serialise numbers and strings for each endpoint", async () => {
    await fetchUsageProjects({ since: "2026-01-01" });
    expect(lastCall().url).toBe("/api/usage/projects?since=2026-01-01");
    await fetchUsageTimeline({ granularity: "monthly" });
    expect(lastCall().url).toBe("/api/usage/timeline?granularity=monthly");
    await fetchUsageSessions({ sort: "cost", limit: 0 });
    expect(lastCall().url).toBe("/api/usage/sessions?sort=cost&limit=0");
    await fetchUsageWindows({ limit: 5 });
    expect(lastCall().url).toBe("/api/usage/windows?limit=5");
    await fetchUsagePrompts({ limit: 10, project: "p q" });
    expect(lastCall().url).toBe("/api/usage/prompts?limit=10&project=p+q");
  });

  it("throw on non-ok usage responses", async () => {
    fetchMock.mockImplementation(async () => json({}, 500));
    await expect(fetchUsageOverview()).rejects.toThrow("request failed: 500");
  });
});
