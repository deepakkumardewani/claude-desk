// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { useScrollSpy } from "./useScrollSpy";

type Callback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
const observers: Array<{ cb: Callback; observed: Element[]; disconnect: () => void }> = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observed: Element[] = [];
      disconnect = vi.fn();
      constructor(public cb: Callback) {
        observers.push(this as never);
      }
      observe(el: Element) {
        this.observed.push(el);
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sections = [{ id: "a" }, { id: "b" }, { id: "missing" }];

function Harness(props: {
  sections: Array<{ id: string }>;
  onActive: (id: string) => void;
  onTop: (show: boolean) => void;
  programmatic?: boolean;
}) {
  const { sectionRefs, contentScrollRef, isProgrammaticScroll } = useScrollSpy({
    sections: props.sections,
    onActiveSectionChange: props.onActive,
    onShowScrollTopChange: props.onTop,
  });
  isProgrammaticScroll.current = props.programmatic ?? false;
  return (
    <div ref={contentScrollRef} data-testid="scroller">
      {["a", "b"].map((id) => (
        <section
          key={id}
          id={id}
          ref={(el) => {
            if (el) sectionRefs.current.set(id, el);
          }}
        />
      ))}
    </div>
  );
}

const entry = (id: string, intersecting: boolean, ratio: number) => ({
  target: { id } as Element,
  isIntersecting: intersecting,
  intersectionRatio: ratio,
});

test("reports scroll-top visibility initially and on scroll across the threshold", () => {
  const onTop = vi.fn();
  const { getByTestId } = render(<Harness sections={[]} onActive={vi.fn()} onTop={onTop} />);
  expect(onTop).toHaveBeenLastCalledWith(false);

  const scroller = getByTestId("scroller");
  scroller.scrollTop = 241;
  act(() => {
    scroller.dispatchEvent(new Event("scroll"));
  });
  expect(onTop).toHaveBeenLastCalledWith(true);

  scroller.scrollTop = 240;
  act(() => {
    scroller.dispatchEvent(new Event("scroll"));
  });
  expect(onTop).toHaveBeenLastCalledWith(false);
});

test("removes the scroll listener on unmount", () => {
  const onTop = vi.fn();
  const { getByTestId, unmount } = render(
    <Harness sections={[]} onActive={vi.fn()} onTop={onTop} />,
  );
  const scroller = getByTestId("scroller");
  unmount();
  onTop.mockClear();
  scroller.dispatchEvent(new Event("scroll"));
  expect(onTop).not.toHaveBeenCalled();
});

test("observes only sections that have elements and picks the most visible", () => {
  const onActive = vi.fn();
  render(<Harness sections={sections} onActive={onActive} onTop={vi.fn()} />);
  expect(observers).toHaveLength(1);
  expect(observers[0].observed.map((e) => e.id)).toEqual(["a", "b"]);

  act(() => {
    observers[0].cb([entry("a", true, 0.25), entry("b", true, 0.75), entry("x", false, 1)]);
  });
  expect(onActive).toHaveBeenCalledWith("b");
});

test("ignores callbacks with nothing intersecting", () => {
  const onActive = vi.fn();
  render(<Harness sections={sections} onActive={onActive} onTop={vi.fn()} />);
  act(() => {
    observers[0].cb([entry("a", false, 0)]);
  });
  expect(onActive).not.toHaveBeenCalled();
});

test("ignores callbacks during a programmatic scroll", () => {
  const onActive = vi.fn();
  render(<Harness sections={sections} onActive={onActive} onTop={vi.fn()} programmatic />);
  act(() => {
    observers[0].cb([entry("a", true, 1)]);
  });
  expect(onActive).not.toHaveBeenCalled();
});

test("does not observe with no sections or without IntersectionObserver; disconnects on unmount", () => {
  render(<Harness sections={[]} onActive={vi.fn()} onTop={vi.fn()} />);
  expect(observers).toHaveLength(0);
  cleanup();

  const { unmount } = render(<Harness sections={sections} onActive={vi.fn()} onTop={vi.fn()} />);
  const first = observers[0];
  unmount();
  expect(first.disconnect).toHaveBeenCalled();

  vi.stubGlobal("IntersectionObserver", undefined);
  observers.length = 0;
  render(<Harness sections={sections} onActive={vi.fn()} onTop={vi.fn()} />);
  expect(observers).toHaveLength(0);
});
