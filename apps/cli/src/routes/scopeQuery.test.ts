import { describe, expect, it } from "vite-plus/test";
import { InvalidProjectDirError } from "../fs/scoped.js";
import {
  isInvalidProjectDir,
  parseMcpScope,
  parseScope,
  parseSettingsLayer,
  projectDirForLayer,
} from "./scopeQuery.js";

describe("parseScope", () => {
  it.each([
    ["project", "project"],
    ["user", "user"],
    ["local", "user"],
    ["", "user"],
    [undefined, "user"],
  ])("%s -> %s", (raw, expected) => {
    expect(parseScope(raw)).toBe(expected);
  });
});

describe("parseSettingsLayer", () => {
  it.each([
    ["project", "project"],
    ["projectLocal", "projectLocal"],
    ["user", "user"],
    ["bogus", "user"],
    [undefined, "user"],
  ])("%s -> %s", (raw, expected) => {
    expect(parseSettingsLayer(raw)).toBe(expected);
  });
});

describe("parseMcpScope", () => {
  it("defaults to user when absent or empty", () => {
    expect(parseMcpScope()).toBe("user");
    expect(parseMcpScope("")).toBe("user");
    expect(parseMcpScope("user")).toBe("user");
  });

  it("accepts project and local", () => {
    expect(parseMcpScope("project")).toBe("project");
    expect(parseMcpScope("local")).toBe("local");
  });

  it("returns undefined for unknown values", () => {
    expect(parseMcpScope("global")).toBeUndefined();
  });
});

describe("projectDirForLayer", () => {
  it("ignores projectDir for the user layer", () => {
    expect(projectDirForLayer("user", "relative")).toBeUndefined();
  });

  it.each(["project", "projectLocal", "local"] as const)(
    "requires an absolute dir for %s",
    (layer) => {
      expect(projectDirForLayer(layer, "/tmp/proj")).toBe("/tmp/proj");
      expect(() => projectDirForLayer(layer)).toThrow(InvalidProjectDirError);
      expect(() => projectDirForLayer(layer, "relative")).toThrow(InvalidProjectDirError);
    },
  );

  it("rejects traversal segments", () => {
    expect(() => projectDirForLayer("project", "/tmp/../etc")).toThrow(/traversal/);
  });
});

describe("isInvalidProjectDir", () => {
  it("narrows only InvalidProjectDirError", () => {
    expect(isInvalidProjectDir(new InvalidProjectDirError())).toBe(true);
    expect(isInvalidProjectDir(new Error("x"))).toBe(false);
    expect(isInvalidProjectDir("x")).toBe(false);
  });
});
