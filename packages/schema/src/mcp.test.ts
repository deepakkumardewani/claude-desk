import { describe, it, expect } from "vite-plus/test";
import {
  parseMcpConfig,
  safeParseMcpConfig,
  mcpServerSchema,
  mcpConfigSchema,
  stdioTransportSchema,
  httpTransportSchema,
  sseTransportSchema,
} from "./mcp.js";

describe("MCP Schema", () => {
  describe("Transport schemas", () => {
    it("should parse valid stdio transport", () => {
      const transport = {
        type: "stdio" as const,
        command: "/usr/bin/python",
        args: ["script.py"],
        env: { VAR: "value" },
      };
      const result = stdioTransportSchema.parse(transport);
      expect(result.type).toBe("stdio");
      expect(result.command).toBe("/usr/bin/python");
    });

    it("should parse valid http transport", () => {
      const transport = {
        type: "http" as const,
        url: "http://localhost:3000",
        headers: { Authorization: "Bearer token" },
      };
      const result = httpTransportSchema.parse(transport);
      expect(result.type).toBe("http");
      expect(result.url).toBe("http://localhost:3000");
    });

    it("should parse valid sse transport", () => {
      const transport = {
        type: "sse" as const,
        url: "https://example.com/events",
      };
      const result = sseTransportSchema.parse(transport);
      expect(result.type).toBe("sse");
      expect(result.url).toBe("https://example.com/events");
    });

    it("should reject invalid http url", () => {
      const transport = {
        type: "http" as const,
        url: "not a url",
      };
      expect(() => httpTransportSchema.parse(transport)).toThrow();
    });
  });

  describe("MCP Server schema", () => {
    it("should parse valid server config", () => {
      const server = {
        name: "my-server",
        transport: {
          type: "stdio" as const,
          command: "python",
        },
      };
      const result = mcpServerSchema.parse(server);
      expect(result.name).toBe("my-server");
      expect(result.disabled).toBe(false);
    });

    it("should reject server without name", () => {
      const server = {
        transport: {
          type: "stdio" as const,
          command: "python",
        },
      };
      expect(() => mcpServerSchema.parse(server)).toThrow();
    });
  });

  describe("MCP Config schema", () => {
    it("should parse empty config", () => {
      const config = {};
      const result = mcpConfigSchema.parse(config);
      expect(result.mcpServers).toEqual({});
    });

    it("should parse valid config with servers", () => {
      const config = {
        mcpServers: {
          server1: {
            name: "server1",
            transport: {
              type: "stdio" as const,
              command: "python",
            },
          },
          server2: {
            name: "server2",
            transport: {
              type: "http" as const,
              url: "http://localhost:3000",
            },
            disabled: true,
          },
        },
      };
      const result = mcpConfigSchema.parse(config);
      expect(Object.keys(result.mcpServers)).toHaveLength(2);
      expect(result.mcpServers.server1.disabled).toBe(false);
      expect(result.mcpServers.server2.disabled).toBe(true);
    });

    it("should reject invalid server in config", () => {
      const config = {
        mcpServers: {
          bad: {
            transport: {
              type: "stdio",
              command: "python",
            },
            // missing name
          },
        },
      };
      expect(() => mcpConfigSchema.parse(config)).toThrow();
    });
  });

  describe("parseMcpConfig", () => {
    it("should parse valid config", () => {
      const config = {
        mcpServers: {
          test: {
            name: "test",
            transport: {
              type: "stdio" as const,
              command: "test",
            },
          },
        },
      };
      const result = parseMcpConfig(config);
      expect(result.mcpServers.test.name).toBe("test");
    });

    it("should throw on invalid config", () => {
      const config = {
        mcpServers: {
          invalid: {
            // missing required fields
          },
        },
      };
      expect(() => parseMcpConfig(config)).toThrow();
    });
  });

  describe("safeParseMcpConfig", () => {
    it("should return success with valid config", () => {
      const config = {
        mcpServers: {
          test: {
            name: "test",
            transport: {
              type: "stdio" as const,
              command: "test",
            },
          },
        },
      };
      const result = safeParseMcpConfig(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mcpServers.test.name).toBe("test");
      }
    });

    it("should return error with invalid config", () => {
      const config = {
        mcpServers: {
          invalid: {
            // missing required fields
          },
        },
      };
      const result = safeParseMcpConfig(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
