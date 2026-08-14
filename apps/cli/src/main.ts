import { serve } from "@hono/node-server";
import open from "open";
import { createToken } from "./auth.js";
import { createApp } from "./server.js";

const DEFAULT_UI_ORIGIN = "http://127.0.0.1:5173";
const UI_WAIT_MS = 20_000;
const UI_POLL_MS = 250;

const token = process.env.CC_STUDIO_TOKEN || createToken();
const app = createApp({ token });

const uiOrigin = process.env.CC_STUDIO_UI_ORIGIN ?? DEFAULT_UI_ORIGIN;
const launchUrl = `${uiOrigin}/#token=${token}`;

app.get("/", (c) => c.redirect(launchUrl));

let port = Number(process.env.PORT ?? 3000);
const portIndex = process.argv.indexOf("--port");
if (portIndex !== -1 && process.argv[portIndex + 1]) {
  port = Number(process.argv[portIndex + 1]);
}

async function waitForUi(origin: string): Promise<boolean> {
  const deadline = Date.now() + UI_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(origin, { signal: AbortSignal.timeout(500) });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, UI_POLL_MS));
    }
  }
  return false;
}

async function openUi(url: string, origin: string): Promise<void> {
  if (process.env.CC_STUDIO_NO_OPEN === "1") {
    return;
  }
  const ready = await waitForUi(origin);
  if (!ready) {
    console.log(`ui not reachable at ${origin} — open the URL above after Vite starts`);
    return;
  }
  await open(url);
}

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`cli api on http://127.0.0.1:${info.port}`);
  console.log(`open ${launchUrl}`);
  void openUi(launchUrl, uiOrigin);
});
