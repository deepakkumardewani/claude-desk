import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";
import { getMimeType } from "hono/utils/mime";

const LIFECYCLE_INJECT = `<script>(function(){if(!window.EventSource)return;var m=location.hash.match(/token=([0-9a-zA-Z]+)/);var token=(m&&m[1])||sessionStorage.getItem("ccs-token");if(!token)return;sessionStorage.setItem("ccs-token",token);var es=new EventSource("/api/lifecycle?access_token="+encodeURIComponent(token));window.addEventListener("pagehide",function(){es.close()});window.addEventListener("beforeunload",function(){es.close()})})()</script>`;

/** Resolve the built SPA directory relative to this module (src or dist). */
export function resolveWebDistDir(fromUrl: string = import.meta.url): string {
  const here = fileURLToPath(new URL(".", fromUrl));
  const candidates = [
    resolve(here, "../web"),
    resolve(here, "web"),
    resolve(here, "../../web/dist"),
    resolve(here, "../../../web/dist"),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) {
      return candidate;
    }
  }

  throw new Error(
    `web dist not found (looked in: ${candidates.join(", ")}). Run bunx vp build first.`,
  );
}

function safeJoin(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split("?")[0] ?? "");
  const cleaned = decoded.replace(/^\/+/, "");
  const target = normalize(resolve(root, cleaned));
  const rel = relative(root, target);
  if (rel.startsWith("..") || resolve(root, rel) !== target) {
    return null;
  }
  // reject null bytes / weird separators
  if (cleaned.includes("\0") || cleaned.includes(`..${sep}`) || cleaned.includes("../")) {
    return null;
  }
  return target;
}

function injectLifecycle(html: string): string {
  if (html.includes("/api/lifecycle")) {
    return html;
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${LIFECYCLE_INJECT}</body>`);
  }
  return `${html}${LIFECYCLE_INJECT}`;
}

function resolveExistingFile(webDistDir: string, urlPath: string): string | null {
  const filePath = safeJoin(webDistDir, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath) {
    return null;
  }

  try {
    const st = statSync(filePath);
    if (st.isFile()) {
      return filePath;
    }
    if (st.isDirectory()) {
      const index = join(filePath, "index.html");
      if (existsSync(index)) {
        return index;
      }
    }
  } catch {
    // fall through to SPA fallback
  }

  const fallback = join(webDistDir, "index.html");
  return existsSync(fallback) ? fallback : null;
}

/** Serve the SPA from web dist with HTML lifecycle injection and history-API fallback. */
export function mountStatic(app: Hono, webDistDir: string = resolveWebDistDir()): void {
  app.get("*", async (c) => {
    const urlPath = new URL(c.req.url).pathname;
    if (urlPath.startsWith("/api/")) {
      return c.notFound();
    }

    const target = resolveExistingFile(webDistDir, urlPath);
    if (!target) {
      return c.text("SPA not built", 404);
    }

    // Path escaped the web root (should be unreachable after safeJoin).
    if (relative(webDistDir, target).startsWith("..")) {
      return c.text("Forbidden", 403);
    }

    const mime = getMimeType(target) ?? "application/octet-stream";
    const body = await readFile(target);

    if (extname(target) === ".html") {
      return c.html(injectLifecycle(body.toString("utf8")));
    }

    return new Response(body, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(body.byteLength),
      },
    });
  });
}
