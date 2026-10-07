// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  animateScrollTo,
  getScrollParent,
  SCROLL_DURATION_MS,
  scrollElementIntoView,
  scrollToTop,
} from "./scroll";

let now = 0;
let frames: FrameRequestCallback[] = [];

/** Runs queued animation frames at the given virtual time. */
function tick(at: number): void {
  now = at;
  const pending = frames;
  frames = [];
  pending.forEach((callback) => callback(at));
}

beforeEach(() => {
  now = 0;
  frames = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function box(overflowY = ""): HTMLElement {
  const element = document.createElement("div");
  if (overflowY) element.style.overflowY = overflowY;
  return element;
}

describe("getScrollParent", () => {
  it("returns the nearest auto/scroll ancestor", () => {
    const outer = box("scroll");
    const inner = box("auto");
    const child = box();
    inner.append(child);
    outer.append(inner);
    document.body.append(outer);
    expect(getScrollParent(child)).toBe(inner);
    expect(getScrollParent(inner)).toBe(outer);
  });

  it("skips non-scrolling ancestors and falls back to the document element", () => {
    const wrapper = box("visible");
    const child = box();
    wrapper.append(child);
    document.body.append(wrapper);
    expect(getScrollParent(child)).toBe(document.documentElement);
  });
});

describe("animateScrollTo", () => {
  it("resolves immediately when already at the target", async () => {
    const container = box();
    container.scrollTop = 40;
    await animateScrollTo(container, 40);
    expect(frames).toHaveLength(0);
  });

  it("eases to the target over the duration and then resolves", async () => {
    const container = box();
    const done = vi.fn();
    const promise = animateScrollTo(container, 100).then(done);

    tick(SCROLL_DURATION_MS / 2);
    expect(container.scrollTop).toBeGreaterThan(50);
    expect(container.scrollTop).toBeLessThan(100);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    tick(SCROLL_DURATION_MS);
    await promise;
    expect(container.scrollTop).toBe(100);
    expect(done).toHaveBeenCalled();
  });

  it("honours a custom duration", async () => {
    const container = box();
    const promise = animateScrollTo(container, -50, 100);
    container.scrollTop = 0;
    tick(100);
    await promise;
    expect(frames).toHaveLength(0);
  });
});

describe("scrollElementIntoView", () => {
  it("scrolls the container so the element sits `offset` below its top", async () => {
    const container = box();
    const element = box();
    container.scrollTop = 10;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ top: 300 } as DOMRect);

    const promise = scrollElementIntoView(element, 24, container);
    tick(SCROLL_DURATION_MS);
    await promise;
    // 10 + (300 - 100) - 24
    expect(container.scrollTop).toBe(186);
  });

  it("never scrolls above the top", async () => {
    const container = box();
    const element = box();
    container.scrollTop = 0;
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ top: 105 } as DOMRect);
    await scrollElementIntoView(element, 24, container);
    expect(container.scrollTop).toBe(0);
  });

  it("uses the scroll parent when no container is given", async () => {
    const parent = box("auto");
    const element = box();
    parent.append(element);
    document.body.append(parent);
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({ top: 0 } as DOMRect);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ top: 224 } as DOMRect);
    const promise = scrollElementIntoView(element);
    tick(SCROLL_DURATION_MS);
    await promise;
    expect(parent.scrollTop).toBe(200);
  });
});

describe("scrollToTop", () => {
  it("animates back to 0", async () => {
    const container = box();
    container.scrollTop = 80;
    const promise = scrollToTop(container);
    tick(SCROLL_DURATION_MS);
    await promise;
    expect(container.scrollTop).toBe(0);
  });
});
