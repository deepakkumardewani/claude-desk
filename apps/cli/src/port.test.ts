import { describe, expect, it } from "vite-plus/test";
import { parsePort } from "./port.js";

describe("parsePort", () => {
  it("parses valid port numbers from strings", () => {
    expect(parsePort("3000")).toBe(3000);
    expect(parsePort("8080")).toBe(8080);
    expect(parsePort("65535")).toBe(65535);
  });

  it("parses valid port numbers from numbers", () => {
    expect(parsePort(3000)).toBe(3000);
    expect(parsePort(0)).toBe(0);
    expect(parsePort(65535)).toBe(65535);
  });

  it("accepts port 0 for OS-assigned ephemeral port", () => {
    expect(parsePort(0)).toBe(0);
    expect(parsePort("0")).toBe(0);
  });

  it("rejects negative port numbers", () => {
    expect(() => parsePort(-1)).toThrow(/Invalid port.*must be an integer between 0 and 65535/);
    expect(() => parsePort("-1")).toThrow(/Invalid port.*must be an integer between 0 and 65535/);
  });

  it("rejects port numbers above 65535", () => {
    expect(() => parsePort(65536)).toThrow(/Invalid port.*must be an integer between 0 and 65535/);
    expect(() => parsePort("65536")).toThrow(
      /Invalid port.*must be an integer between 0 and 65535/,
    );
  });

  it("rejects non-integer port numbers", () => {
    expect(() => parsePort(3000.5)).toThrow(/Invalid port.*must be an integer between 0 and 65535/);
    expect(() => parsePort("3000.5")).toThrow(
      /Invalid port.*must be an integer between 0 and 65535/,
    );
  });

  it("rejects non-numeric strings", () => {
    expect(() => parsePort("abc")).toThrow(/Invalid port.*must be an integer between 0 and 65535/);
    expect(() => parsePort("3000x")).toThrow(
      /Invalid port.*must be an integer between 0 and 65535/,
    );
  });
});
