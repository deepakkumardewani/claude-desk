// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SKILLS_SH_SEARCH_DEBOUNCE_MS, SkillsShSearch, formatInstalls } from "./SkillsShSearch";

const searchSkillsSh = vi.fn();
const resolveSkillsShItem = vi.fn();
const fetchRepoFile = vi.fn();
vi.mock("../../lib/discoverApi", () => ({
  searchSkillsSh: (...args: unknown[]) => searchSkillsSh(...args),
  resolveSkillsShItem: (...args: unknown[]) => resolveSkillsShItem(...args),
  fetchRepoFile: (...args: unknown[]) => fetchRepoFile(...args),
}));
vi.mock("./InstallDialog", () => ({
  InstallDialog: (props: { items: Array<{ name: string }>; repo: { sha: string } }) => (
    <div role="dialog" aria-label="Install dialog">
      {props.items[0].name}@{props.repo.sha}
    </div>
  ),
}));

const RESULT = {
  id: "acme/kit/react-tips",
  source: "acme/kit",
  skillId: "react-tips",
  name: "react-tips",
  installs: 768_812,
};
const REPO = {
  owner: "acme",
  repo: "kit",
  ref: "main",
  sha: "abc1234567",
  htmlUrl: "https://github.com/acme/kit",
};
const ITEM = {
  id: "skill:skills/react-tips",
  kind: "skill",
  name: "react-tips",
  path: "skills/react-tips",
  files: [{ path: "skills/react-tips/SKILL.md" }],
};

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Search skills.sh"), { target: { value } });
}

async function settle(ms = SKILLS_SH_SEARCH_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchRepoFile.mockResolvedValue({ ok: true, content: "# Hello", size: 7 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  searchSkillsSh.mockReset();
  resolveSkillsShItem.mockReset();
  fetchRepoFile.mockReset();
});

describe("formatInstalls", () => {
  it("compacts counts", () => {
    expect(formatInstalls(768_812)).toBe("768.8K");
    expect(formatInstalls(42)).toBe("42");
  });
});

describe("SkillsShSearch search", () => {
  it("shows example chips when empty and searches when one is picked", async () => {
    searchSkillsSh.mockResolvedValue({ ok: true, results: [] });
    render(<SkillsShSearch />);
    const chips = screen.getByLabelText("Example searches").querySelectorAll("button");
    expect(chips.length).toBeGreaterThanOrEqual(4);
    expect(chips.length).toBeLessThanOrEqual(6);
    fireEvent.click(screen.getByRole("button", { name: "react" }));
    await settle();
    expect(searchSkillsSh).toHaveBeenCalledWith("react", expect.anything());
  });

  it("fires one request only after typing settles", async () => {
    searchSkillsSh.mockResolvedValue({ ok: true, results: [RESULT] });
    render(<SkillsShSearch />);
    type("re");
    await settle(100);
    type("rea");
    await settle(100);
    type("reac");
    expect(searchSkillsSh).not.toHaveBeenCalled();
    await settle();
    expect(searchSkillsSh).toHaveBeenCalledTimes(1);
    expect(searchSkillsSh).toHaveBeenCalledWith("reac", expect.anything());
    expect(screen.getByText("768.8K installs")).toBeTruthy();
    expect(screen.getByText("acme/kit")).toBeTruthy();
  });

  it("aborts the in-flight request on a new keystroke", async () => {
    const signals: AbortSignal[] = [];
    searchSkillsSh.mockImplementation((_q: string, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise(() => {});
    });
    render(<SkillsShSearch />);
    type("react");
    await settle();
    expect(signals[0].aborted).toBe(false);
    type("reacts");
    expect(signals[0].aborted).toBe(true);
    await settle();
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);
  });

  it("fires no request for a 1-char query and shows no results", async () => {
    render(<SkillsShSearch />);
    type("r");
    await settle(1000);
    expect(searchSkillsSh).not.toHaveBeenCalled();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows Can't reach skills.sh with Retry on network failure", async () => {
    searchSkillsSh.mockResolvedValueOnce({ ok: false, code: "NETWORK", message: "x" });
    render(<SkillsShSearch />);
    type("react");
    await settle();
    expect(screen.getByText("Can't reach skills.sh")).toBeTruthy();
    searchSkillsSh.mockResolvedValueOnce({ ok: true, results: [RESULT] });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(screen.getByText("768.8K installs")).toBeTruthy();
  });

  it("shows the schema-mismatch copy with a skills.sh link", async () => {
    searchSkillsSh.mockResolvedValue({ ok: false, code: "SKILLS_SH_SCHEMA", message: "x" });
    render(<SkillsShSearch />);
    type("react");
    await settle();
    expect(screen.getByText("skills.sh changed its search format")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open skills.sh" });
    expect(link.getAttribute("href")).toBe("https://skills.sh");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

describe("SkillsShSearch detail + install", () => {
  async function openResult() {
    searchSkillsSh.mockResolvedValue({ ok: true, results: [RESULT] });
    render(<SkillsShSearch onOpenRepo={onOpenRepo} />);
    type("react");
    await settle();
    fireEvent.click(screen.getByText("react-tips"));
    await settle(0);
  }
  const onOpenRepo = vi.fn();

  afterEach(() => onOpenRepo.mockReset());

  it("resolves lazily on open, offers links, and Install opens the shared InstallDialog", async () => {
    resolveSkillsShItem.mockResolvedValue({ ok: true, repo: REPO, item: ITEM });
    searchSkillsSh.mockResolvedValue({ ok: true, results: [RESULT] });
    render(<SkillsShSearch />);
    type("react");
    await settle();
    expect(resolveSkillsShItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("react-tips"));
    await settle(0);
    expect(resolveSkillsShItem).toHaveBeenCalledWith("acme/kit/react-tips");
    expect(fetchRepoFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "skills/react-tips/SKILL.md", sha: "abc1234567" }),
    );
    expect(screen.getByRole("link", { name: "View on GitHub" }).getAttribute("href")).toBe(
      "https://github.com/acme/kit/tree/abc1234567/skills/react-tips",
    );
    expect(screen.getByRole("link", { name: "View on skills.sh" }).getAttribute("href")).toBe(
      "https://skills.sh/acme/kit/react-tips",
    );
    fireEvent.click(screen.getByRole("button", { name: "Install…" }));
    expect(screen.getByRole("dialog", { name: "Install dialog" }).textContent).toBe(
      "react-tips@abc1234567",
    );
  });

  it("shows the drawer skeleton and action placeholders while resolving", async () => {
    resolveSkillsShItem.mockReturnValue(new Promise(() => {}));
    await openResult();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("button", { name: "Install…" })).toBeNull();
  });

  it("shows the locate-failure copy and opens the repo in the GitHub explorer", async () => {
    resolveSkillsShItem.mockResolvedValue({
      ok: false,
      code: "SKILL_NOT_FOUND",
      message: "gone",
    });
    await openResult();
    expect(screen.getByText("Couldn't locate this skill in acme/kit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open repo in GitHub explorer" }));
    expect(onOpenRepo).toHaveBeenCalledWith("acme/kit");
    expect(screen.queryByText("Couldn't locate this skill in acme/kit")).toBeNull();
  });

  it("offers Retry for other resolution failures", async () => {
    resolveSkillsShItem.mockResolvedValueOnce({
      ok: false,
      code: "GITHUB_UNREACHABLE",
      message: "GitHub down",
    });
    await openResult();
    expect(screen.getByText("GitHub down")).toBeTruthy();
    resolveSkillsShItem.mockResolvedValueOnce({ ok: true, repo: REPO, item: ITEM });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle(0);
    expect(screen.getByRole("button", { name: "Install…" })).toBeTruthy();
  });
});
