#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { startStudio } from "./studio.js";
import { parsePort } from "./port.js";

const mainCommand = defineCommand({
  meta: {
    name: "claude-desk",
    version: "0.1.0",
    description: "Browse and edit Claude Code config in the browser",
  },
  args: {
    port: {
      type: "string",
      description: "Port to listen on (default: random)",
      default: "0",
      alias: "p",
    },
    "keep-alive": {
      type: "boolean",
      description: "Keep the server running after the browser closes",
      default: false,
    },
  },
  async run({ args }) {
    const port = parsePort(args.port);

    const keepAlive = Boolean(args["keep-alive"]);
    const running = await startStudio({ port, keepAlive });

    console.log(`claude-desk listening on ${running.url}#token=${running.token}`);
    if (keepAlive) {
      console.log("keep-alive: server will stay up until interrupted");
    } else {
      console.log("close the browser tab to shut down (or Ctrl+C)");
    }

    const shutdown = async () => {
      await running.close();
      process.exit(0);
    };

    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());

    await running.waitUntilExit();
    process.exit(0);
  },
});

void runMain(mainCommand);
