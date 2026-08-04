import { useCallback, useEffect, useRef, useState } from "react";

export type SectionDef = {
  /** Stable DOM id of the section landmark (also its anchor). */
  id: string;
  /** User-facing section name, used in the indicator and announcements. */
  label: string;
};

type Measured = { def: SectionDef; el: HTMLElement; top: number; left: number };

/** Rows whose tops differ by less than this are treated as side-by-side. */
const SAME_ROW_TOLERANCE_PX = 8;
/** Ignore scroll-driven active updates for this long after explicit navigation
 *  so a smooth scroll cannot make the indicator oscillate mid-flight. */
const NAV_SCROLL_SUPPRESS_MS = 800;

function headerOffsetPx(): number {
  if (typeof window === "undefined") return 64 + 16;
  const rootStyle = getComputedStyle(document.documentElement);
  const raw = rootStyle.getPropertyValue("--app-header-h").trim();
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed)) return 64 + 16;
  // The app declares its header height in rem ("3.5rem").
  const px = raw.endsWith("rem")
    ? parsed * (parseFloat(rootStyle.fontSize) || 16)
    : parsed;
  return px + 16;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Previous/Next navigation over the Combat Lab's existing logical sections.
 *
 * Sections are located by stable DOM ids (never text or positional selectors)
 * and ordered by their VISUAL position at the moment of use — the mobile
 * layout reorders the versus columns with CSS `order`, so DOM order alone
 * would walk sections in the wrong sequence below the desktop breakpoint.
 *
 * The active section follows scroll position: the last section whose top sits
 * above a fixed reference line under the app header. A single reference line
 * cannot select two sections at once, which keeps the indicator from
 * oscillating while sections share the viewport.
 */
export function useSectionNavigation(sections: SectionDef[]) {
  const [active, setActive] = useState(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const suppressUntilRef = useRef(0);

  const measure = useCallback((): Measured[] => {
    if (typeof document === "undefined") return [];
    const found: Measured[] = [];
    for (const def of sectionsRef.current) {
      const el = document.getElementById(def.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      found.push({
        def,
        el,
        top: rect.top + window.scrollY,
        left: rect.left,
      });
    }
    found.sort((a, b) =>
      Math.abs(a.top - b.top) > SAME_ROW_TOLERANCE_PX ? a.top - b.top : a.left - b.left
    );
    return found;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (Date.now() < suppressUntilRef.current) return;
      const measured = measure();
      if (measured.length === 0) return;
      const refLine = window.scrollY + headerOffsetPx() + 8;
      let idx = 0;
      for (let i = 0; i < measured.length; i++) {
        if (measured[i].top <= refLine) idx = i;
      }
      // Scrolling identifies a ROW; reading order enters a row at its first
      // section, so snap back to the row start …
      while (
        idx > 0 &&
        Math.abs(measured[idx - 1].top - measured[idx].top) <= SAME_ROW_TOLERANCE_PX
      ) {
        idx--;
      }
      const cur = activeRef.current;
      if (idx === cur) return;
      // … and never override an EXPLICIT selection inside the same row —
      // side-by-side columns share a top, so scroll position genuinely cannot
      // tell them apart.
      const curM = measured[cur];
      if (curM && Math.abs(curM.top - measured[idx].top) <= SAME_ROW_TOLERANCE_PX) return;
      setActive(idx);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [measure]);

  const goTo = useCallback(
    (index: number): SectionDef | null => {
      const measured = measure();
      if (measured.length === 0) return null;
      const clamped = Math.max(0, Math.min(measured.length - 1, index));
      const target = measured[clamped];
      suppressUntilRef.current = Date.now() + NAV_SCROLL_SUPPRESS_MS;
      setActive(clamped);
      // Focus FIRST (the wrapper carries tabIndex={-1}: focusable
      // programmatically, never a tab stop): Chrome cancels an in-flight
      // smooth scroll when an element is focused, so focusing after
      // scrollIntoView would freeze the scroll where it started.
      target.el.focus?.({ preventScroll: true });
      target.el.scrollIntoView?.({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
      return target.def;
    },
    [measure]
  );

  const goPrev = useCallback(() => goTo(activeRef.current - 1), [goTo]);
  const goNext = useCallback(() => goTo(activeRef.current + 1), [goTo]);

  const count = sections.length;
  return {
    /** 0-based index of the active section in VISUAL order. */
    activeIndex: active,
    activeLabel: sections.length
      ? (measureLabel(measure, active) ?? sections[Math.min(active, count - 1)].label)
      : "",
    count,
    canPrev: active > 0,
    canNext: active < count - 1,
    goPrev,
    goNext,
  };
}

/** Label of the active section under the current visual ordering. */
function measureLabel(measure: () => Measured[], active: number): string | null {
  const measured = measure();
  if (measured.length === 0) return null;
  return measured[Math.max(0, Math.min(measured.length - 1, active))].def.label;
}
