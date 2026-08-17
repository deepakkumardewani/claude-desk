import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import open from "open";
import { createToken } from "./auth.js";
import { createApp } from "./server.js";
import { mountStatic, resolveWebDistDir } from "./static.js";

export type StartOptions = {
  port: number;
  keepAlive: boolean;
  openBrowser?: boolean;
  webDistDir?: string;
  openFn?: (url: string) => Promise<unknown>;
  token?: string;
};

export type RunningServer = {
  url: string;
  port: number;
  token: string;
  close: () => Promise<void>;
  waitUntilExit: () => Promise<void>;
};

type LifecycleState = {
  clients: number;
  sawClient: boolean;
  exitTimer: ReturnType<typeof setTimeout> | null;
  shouldExit: boolean;
  onIdle: () => void;
};

function createLifecycleState(onIdle: () => void): LifecycleState {
  return {
    clients: 0,
    sawClient: false,
    exitTimer: null,
    shouldExit: true,
    onIdle,
  };
}

/** SSE endpoint: browser tabs hold a connection; when the last tab closes, onIdle fires. */
export function mountLifecycle(app: Hono, state: LifecycleState): void {
  app.get("/api/lifecycle", (c) => {
    return streamSSE(c, async (stream) => {
      state.clients += 1;
      state.sawClient = true;
      if (state.exitTimer) {
        clearTimeout(state.exitTimer);
        state.exitTimer = null;
      }

      await stream.writeSSE({ event: "hello", data: "ok" });

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: String(Date.now()) });
      }, 15_000);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          clearInterval(heartbeat);
          state.clients = Math.max(0, state.clients - 1);
          if (state.shouldExit && state.sawClient && state.clients === 0) {
            state.exitTimer = setTimeout(() => state.onIdle(), 750);
          }
          resolve();
        });
      });
    });
  });
}

export async function startStudio(options: StartOptions): Promise<RunningServer> {
  const port = options.port;
  const webDistDir = options.webDistDir ?? resolveWebDistDir();
  const token = options.token ?? createToken();
  const app = createApp({ token });

  let resolveExit!: () => void;
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  let closeServer: (() => Promise<void>) | null = null;

  const lifecycle = createLifecycleState(() => {
    void closeServer?.()
      .catch((err) => console.error("failed to close server:", err))
      .finally(() => resolveExit());
  });
  lifecycle.shouldExit = !options.keepAlive;

  mountLifecycle(app, lifecycle);
  mountStatic(app, webDistDir);

  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });

  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", (error) => reject(error));
  });

  const address = server.address();
  const boundPort =
    address && typeof address === "object" && "port" in address ? address.port : port;
  const url = `http://127.0.0.1:${boundPort}/`;

  closeServer = async () => {
    lifecycle.shouldExit = false;
    if (lifecycle.exitTimer) {
      clearTimeout(lifecycle.exitTimer);
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  };

  const shouldOpen = options.openBrowser !== false && process.env.CC_STUDIO_NO_OPEN !== "1";
  if (shouldOpen) {
    const openFn = options.openFn ?? ((target: string) => open(target));
    await openFn(`${url}#token=${token}`);
  }

  return {
    url,
    port: boundPort,
    token,
    close: async () => {
      await closeServer?.();
      resolveExit();
    },
    waitUntilExit: () => exitPromise,
  };
}
