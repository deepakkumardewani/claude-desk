import { describe, expect, it } from "vite-plus/test";
import { createFetchStub, UnmatchedFetchError } from "./fetchStub.js";

describe("createFetchStub", () => {
  it("serves a fixture for a matching URL and records the call", async () => {
    const stub = createFetchStub([
      { match: "api.github.com/repos/a/b", respond: { fixture: "github-repo-meta" } },
    ]);
    const res = await stub("https://api.github.com/repos/a/b");
    expect(res.status).toBe(200);
    expect(await res.json()).toBeTypeOf("object");
    expect(stub.calls).toEqual(["https://api.github.com/repos/a/b"]);
  });

  it("supports regex, predicate, literal body and status", async () => {
    const stub = createFetchStub([
      { match: /raw\./, respond: { body: { ok: 1 } }, status: 201 },
      { match: (url) => url.pathname === "/p", respond: () => new Response("x") },
    ]);
    expect((await stub("https://raw.example/x")).status).toBe(201);
    expect(await (await stub("https://h.example/p")).text()).toBe("x");
  });

  it("throws on an unmatched URL", async () => {
    const stub = createFetchStub([{ match: "only-this-host", respond: { body: {} } }]);
    await expect(stub("https://unknown.example/")).rejects.toBeInstanceOf(UnmatchedFetchError);
  });
});
