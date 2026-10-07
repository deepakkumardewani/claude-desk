import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { STUB_HOST } from "../../constants.js";
import {
  RATE_LIMIT_HEADERS,
  STUB_COMMIT_SHA,
  STUB_OWNER,
  STUB_PREFIX,
  STUB_REPO,
  STUB_SKILL_PATH,
  rawSkillContent,
  repoMetaPayload,
  skillsShSearchPayload,
  treePayload,
} from "./payloads.js";

/** Status for any path the stub has no recorded answer for; never a real HTTP status. */
export const UNMATCHED_STATUS = 599;
export const LOG_PATH = "/__log";

export type StubLogEntry = { method: string; path: string; status: number; matched: boolean };

export type StubServer = {
  port: number;
  url: string;
  log: () => StubLogEntry[];
  close: () => Promise<void>;
};

type Reply = { status: number; body: string; contentType: string };

const json = (value: unknown): Reply => ({
  status: 200,
  body: JSON.stringify(value),
  contentType: "application/json",
});
const text = (value: string): Reply => ({
  status: 200,
  body: value,
  contentType: "text/plain; charset=utf-8",
});

const REPO_API = `${STUB_PREFIX.githubApi}/repos/${STUB_OWNER}/${STUB_REPO}`;
const TREE_REF = new RegExp(`^${REPO_API}/git/trees/[^/]+$`);
const COMMIT_REF = new RegExp(`^${REPO_API}/commits/[^/]+$`);
const RAW_SKILL = `${STUB_PREFIX.githubRaw}/${STUB_OWNER}/${STUB_REPO}/${STUB_COMMIT_SHA}/${STUB_SKILL_PATH}`;

function route(method: string, pathname: string): Reply | undefined {
  if (method !== "GET") return undefined;
  if (pathname === REPO_API) return json(repoMetaPayload);
  if (COMMIT_REF.test(pathname)) return text(STUB_COMMIT_SHA);
  if (TREE_REF.test(pathname)) return json(treePayload);
  if (pathname === RAW_SKILL) return text(rawSkillContent);
  if (pathname === STUB_PREFIX.skillsSh) return json(skillsShSearchPayload);
  return undefined;
}

function respond(res: ServerResponse, reply: Reply): void {
  res.writeHead(reply.status, {
    "content-type": reply.contentType,
    "content-length": Buffer.byteLength(reply.body),
    ...RATE_LIMIT_HEADERS,
  });
  res.end(reply.body);
}

/**
 * Local stand-in for api.github.com, raw.githubusercontent.com and skills.sh. It binds to
 * loopback only, so nothing outside this machine can reach it, and it records every request
 * so a spec can prove nothing unexpected was asked for.
 */
export function startStubServer(options: { port: number }): Promise<StubServer> {
  const entries: StubLogEntry[] = [];

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? "GET";
    const { pathname } = new URL(req.url ?? "/", `http://${STUB_HOST}`);

    if (pathname === LOG_PATH) {
      respond(res, json(entries));
      return;
    }

    const reply = route(method, pathname);
    const status = reply?.status ?? UNMATCHED_STATUS;
    entries.push({ method, path: pathname, status, matched: reply !== undefined });
    respond(res, reply ?? { status: UNMATCHED_STATUS, body: "", contentType: "text/plain" });
  };

  return new Promise((resolve, reject) => {
    const server: Server = createServer(handle);
    server.once("error", reject);
    server.listen(options.port, STUB_HOST, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        url: `http://${STUB_HOST}:${port}`,
        log: () => [...entries],
        close: () =>
          new Promise<void>((done, fail) => {
            server.closeAllConnections();
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
