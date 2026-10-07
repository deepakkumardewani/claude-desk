import { describe, expect, it } from "vite-plus/test";
import { DiscoverError, err, ok } from "./errors.js";

describe("DiscoverError", () => {
  it("carries code, message and optional details", () => {
    const error = new DiscoverError("RATE_LIMITED", "slow down", { resetAt: "soon" });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DiscoverError");
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.message).toBe("slow down");
    expect(error.details).toEqual({ resetAt: "soon" });
  });

  it("leaves details undefined when none are given", () => {
    expect(new DiscoverError("BAD_INPUT", "x").details).toBeUndefined();
  });
});

describe("Result helpers", () => {
  it("ok wraps a value", () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
  });

  it("err wraps an error", () => {
    const error = new DiscoverError("NOT_TEXT", "binary");
    const result = err(error);
    expect(result).toEqual({ ok: false, error });
    expect(result.ok).toBe(false);
  });
});
