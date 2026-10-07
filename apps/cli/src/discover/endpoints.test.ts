import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  EndpointOverrideError,
  GITHUB_API_BASE_VAR,
  GITHUB_RAW_BASE_VAR,
  SKILLS_SH_URL_VAR,
  githubApiBase,
  githubRawBase,
  skillsShSearchUrl,
} from "./endpoints.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("endpoints", () => {
  it("returns the unchanged production URLs when no override is set", () => {
    vi.stubEnv(GITHUB_API_BASE_VAR, "");
    vi.stubEnv(GITHUB_RAW_BASE_VAR, "");
    vi.stubEnv(SKILLS_SH_URL_VAR, "");
    expect(githubApiBase()).toBe("https://api.github.com");
    expect(githubRawBase()).toBe("https://raw.githubusercontent.com");
    expect(skillsShSearchUrl()).toBe("https://skills.sh/api/search");
  });

  it("honors loopback overrides and trims trailing slashes", () => {
    vi.stubEnv(GITHUB_API_BASE_VAR, "http://127.0.0.1:4010/");
    vi.stubEnv(GITHUB_RAW_BASE_VAR, "http://localhost:4010");
    vi.stubEnv(SKILLS_SH_URL_VAR, "http://127.0.0.1:4010/api/search");
    expect(githubApiBase()).toBe("http://127.0.0.1:4010");
    expect(githubRawBase()).toBe("http://localhost:4010");
    expect(skillsShSearchUrl()).toBe("http://127.0.0.1:4010/api/search");
  });

  it("evaluates lazily on every call", () => {
    expect(githubApiBase()).toBe("https://api.github.com");
    vi.stubEnv(GITHUB_API_BASE_VAR, "http://127.0.0.1:1");
    expect(githubApiBase()).toBe("http://127.0.0.1:1");
  });

  it.each([
    "https://evil.example.com",
    "http://127.0.0.1.evil.com",
    "http://user@evil.com@127.0.0.1.evil.com",
    "ftp://127.0.0.1",
    "not a url",
  ])("rejects the non-loopback or invalid override %s", (value) => {
    vi.stubEnv(GITHUB_API_BASE_VAR, value);
    expect(() => githubApiBase()).toThrow(EndpointOverrideError);
  });

  it("names the offending variable on the error", () => {
    vi.stubEnv(SKILLS_SH_URL_VAR, "https://evil.example.com");
    expect(() => skillsShSearchUrl()).toThrow(SKILLS_SH_URL_VAR);
  });
});
