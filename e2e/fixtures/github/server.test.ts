import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { STUB_HOST } from "../../constants.js";
import {
  STUB_COMMIT_SHA,
  STUB_PREFIX,
  STUB_SKILL_PATH,
  rawSkillContent,
  skillsShSearchPayload,
  treePayload,
} from "./payloads.js";
import { LOG_PATH, UNMATCHED_STATUS, startStubServer, type StubServer } from "./server.js";

let stub: StubServer;

beforeAll(async () => {
  stub = await startStubServer({ port: 0 });
});

afterAll(async () => {
  await stub.close();
});

const get = (path: string) => fetch(`${stub.url}${path}`);

describe("github stub server", () => {
  it("binds to 127.0.0.1 only", () => {
    expect(stub.url).toContain(`http://${STUB_HOST}:`);
    expect(STUB_HOST).toBe("127.0.0.1");
  });

  it("serves the recorded repo meta, commit sha, tree and raw skill with rate-limit headers", async () => {
    const repo = `${STUB_PREFIX.githubApi}/repos/anthropics/skills`;
    const meta = await get(repo);
    expect(meta.status).toBe(200);
    expect(await meta.json()).toMatchObject({ default_branch: "main" });
    expect(meta.headers.get("x-ratelimit-remaining")).toBe("4999");
    expect(meta.headers.get("x-ratelimit-reset")).toBeTruthy();

    expect(await (await get(`${repo}/commits/main`)).text()).toBe(STUB_COMMIT_SHA);

    const tree = await (await get(`${repo}/git/trees/${STUB_COMMIT_SHA}?recursive=1`)).json();
    expect(tree).toEqual(treePayload);

    const raw = await get(
      `${STUB_PREFIX.githubRaw}/anthropics/skills/${STUB_COMMIT_SHA}/${STUB_SKILL_PATH}`,
    );
    expect(await raw.text()).toBe(rawSkillContent);
  });

  it("serves the recorded skills.sh search payload", async () => {
    const res = await get(`${STUB_PREFIX.skillsSh}?q=react&limit=20`);
    expect(await res.json()).toEqual(skillsShSearchPayload);
  });

  it("answers an unmatched path with 599 and records it in the log", async () => {
    const res = await get("/github-api/repos/someone/else");
    expect(res.status).toBe(UNMATCHED_STATUS);

    const log = (await (await get(LOG_PATH)).json()) as Array<{ path: string; matched: boolean }>;
    const entry = log.find((item) => item.path === "/github-api/repos/someone/else");
    expect(entry).toMatchObject({ matched: false });
    expect(stub.log().some((item) => item.path === LOG_PATH)).toBe(false);
  });
});
