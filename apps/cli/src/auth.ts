import { randomBytes, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { Hono } from "hono";

const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function createToken(): string {
  return randomBytes(32).toString("hex");
}

function hostnameFromHostHeader(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    if (close !== -1) {
      return trimmed.slice(0, close + 1);
    }
  }
  const colon = trimmed.lastIndexOf(":");
  if (colon !== -1 && trimmed.indexOf(":") === colon) {
    return trimmed.slice(0, colon);
  }
  return trimmed;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return ALLOWED_HOSTNAMES.has(normalized) || ALLOWED_HOSTNAMES.has(`[${normalized}]`);
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function decodedPathname(url: string): string {
  const pathname = new URL(url).pathname;
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

export function registerSecurity(app: Hono): void {
  app.use("*", async (c, next) => {
    const hostHeader = c.req.header("host");
    const hostname = hostHeader ? hostnameFromHostHeader(hostHeader) : new URL(c.req.url).hostname;
    if (!hostname || !isLoopbackHostname(hostname)) {
      return c.json({ error: "forbidden_host" }, 403);
    }

    const origin = c.req.header("origin");
    if (origin) {
      try {
        const { hostname } = new URL(origin);
        if (!isLoopbackHostname(hostname)) {
          return c.json({ error: "forbidden_origin" }, 403);
        }
      } catch {
        return c.json({ error: "forbidden_origin" }, 403);
      }
    }

    await next();
  });
}

export function requireBearerToken(token: string): MiddlewareHandler {
  const expected = `Bearer ${token}`;

  return async (c, next) => {
    const pathname = decodedPathname(c.req.url);
    if (!pathname.startsWith("/api/")) {
      await next();
      return;
    }

    if (process.env.CC_STUDIO_INSECURE === "1") {
      await next();
      return;
    }

    if (c.req.method === "GET" && pathname === "/api/lifecycle") {
      const accessToken = c.req.query("access_token") ?? "";
      if (safeEqual(accessToken, token)) {
        await next();
        return;
      }
    }

    const header = c.req.header("authorization") ?? "";
    if (!safeEqual(header, expected)) {
      return c.json({ error: "unauthorized" }, 401);
    }

    await next();
  };
}
