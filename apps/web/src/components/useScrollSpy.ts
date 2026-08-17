import { useEffect, useRef } from "react";

const SCROLL_TOP_THRESHOLD = 240;

export function useScrollSpy({
  sections,
  onActiveSectionChange,
  onShowScrollTopChange,
}: {
  sections: Array<{ id: string }>;
  onActiveSectionChange: (sectionId: string) => void;
  onShowScrollTopChange: (show: boolean) => void;
}) {
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);

  // Handle scroll-to-top visibility
  useEffect(() => {
    const container = contentScrollRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      onShowScrollTopChange(container.scrollTop > SCROLL_TOP_THRESHOLD);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [onShowScrollTopChange]);

  // Handle section tracking via IntersectionObserver
  useEffect(() => {
    const container = contentScrollRef.current;
    if (!container || sections.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) {
          return;
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        const nextId = visible[0]?.target.id;
        if (nextId) {
          onActiveSectionChange(nextId);
        }
      },
      {
        root: container,
        rootMargin: "-12% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const section of sections) {
      const element = sectionRefs.current.get(section.id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [sections, onActiveSectionChange]);

  return {
    sectionRefs,
    contentScrollRef,
    isProgrammaticScroll,
  };
}
