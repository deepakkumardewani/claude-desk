import { describe, expect, it } from "vite-plus/test";
import { isFileNotFound, PathEscapeError } from "./errors.js";

describe("isFileNotFound", () => {
  it("returns true for ENOENT errors", () => {
    const err = new Error("File not found") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    expect(isFileNotFound(err)).toBe(true);
  });

  it("returns false for other error codes", () => {
    const err = new Error("Permission denied") as NodeJS.ErrnoException;
    err.code = "EACCES";
    expect(isFileNotFound(err)).toBe(false);
  });

  it("returns false for non-Error objects", () => {
    expect(isFileNotFound("string error")).toBe(false);
    expect(isFileNotFound(null)).toBe(false);
    expect(isFileNotFound(undefined)).toBe(false);
    expect(isFileNotFound(42)).toBe(false);
  });

  it("returns false for Error objects without code property", () => {
    expect(isFileNotFound(new Error("Something went wrong"))).toBe(false);
  });
});

describe("PathEscapeError", () => {
  it("is an Error instance", () => {
    const err = new PathEscapeError();
    expect(err).toBeInstanceOf(Error);
  });

  it("has the name 'PathEscapeError'", () => {
    const err = new PathEscapeError();
    expect(err.name).toBe("PathEscapeError");
  });

  it("uses default message when not provided", () => {
    const err = new PathEscapeError();
    expect(err.message).toBe("path escapes bounds");
  });

  it("uses custom message when provided", () => {
    const customMsg = "attempted path escape: ../../../etc/passwd";
    const err = new PathEscapeError(customMsg);
    expect(err.message).toBe(customMsg);
  });
});
