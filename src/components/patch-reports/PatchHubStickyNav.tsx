import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { ReportSectionNode } from "@/lib/patch-reports/report-structure";
import {
  PATCH_HUB_TOP_ANCHOR,
  activeSrAnchor,
  buildSrNavGroups,
  isCondensedNavStuck,
  srNavAnchors,
  type MeasuredBox,
  type SrNavDestination,
} from "@/lib/patch-reports/sr-navigation";

/*
 * Landing offset. Report anchors carry `scroll-mt-24` (6rem). While this
 * navigator is mounted the root scroller adds just enough scroll-padding that
 * a landed heading clears the HUD band (--app-header-h), the navigator
 * (0.375rem gap + h-9) and 0.75rem of air: header + 3.375rem in total. The
 * padding is removed again on unmount, so Catch Up and every other route keep
 * their own landing geometry.
 */
const SCROLL_PADDING = "max(0px, calc(var(--app-header-h) + 3.375rem - 6rem))";

/** The strip's height (its `h-9`): the probe is measured from the holder, not the animated strip. */
const STRIP_HEIGHT = 36;

/**
 * Gap between the strip's bottom edge and the "you are here" probe line. A
 * landed heading sits 12px below the strip, so this leaves it comfortably
 * inside the section it opens, whatever the sub-pixel rounding.
 */
const PROBE_GAP = 24;

// 24px-tall hit area (WCAG 2.5.8) inside the 36px strip; the ring still has room above and below.
/** Clearance kept between a revealed link and the strip's edges (the right edge carries a fade). */
const REVEAL_MARGIN = 24;

/**
 * Scroll the strip, never the page, so `link` sits fully inside it with
 * clearance. Used for the active destination and for keyboard focus (browsers
 * leave a partly visible focused link where it is, under the edge fade).
 */
function revealInStrip(strip: HTMLElement, link: HTMLElement) {
  if (strip.scrollWidth <= strip.clientWidth) return;
  const left = link.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
  const right = left + link.offsetWidth;
  if (left - REVEAL_MARGIN < strip.scrollLeft) strip.scrollLeft = Math.max(0, left - REVEAL_MARGIN);
  else if (right + REVEAL_MARGIN > strip.scrollLeft + strip.clientWidth) {
    strip.scrollLeft = right + REVEAL_MARGIN - strip.clientWidth;
  }
}

const linkBase =
  "inline-flex min-h-6 items-center rounded px-1 hover:text-[#c9a84c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60";

const DestinationLink = ({
  destination,
  active,
  linkRef,
}: {
  destination: SrNavDestination;
  active: boolean;
  linkRef: (el: HTMLAnchorElement | null) => void;
}) => (
  <a
    ref={linkRef}
    href={`#${destination.anchor}`}
    aria-current={active ? "location" : undefined}
    className={`${linkBase} whitespace-nowrap ${
      destination.kind === "section" ? "font-semibold" : "text-muted-foreground"
    } ${active ? "!text-[#c9a84c]" : ""}`}
  >
    {destination.label}
    {destination.kind === "bucket" && (
      <span className="ml-1 font-normal tabular-nums opacity-80">{destination.count}</span>
    )}
  </a>
);

/**
 * PHSR3 condensed Patch Report navigator: one quiet line that appears once the
 * full section navigator has scrolled away, for jumping around the main game
 * (Champions → Buffs / Nerfs / Adjustments, Items, Runes, Systems) and back to
 * the top.
 *
 * Document navigation, not chrome: plain fragment links (history, Back,
 * middle-click and deep links behave like the full navigator's), hidden from
 * the accessibility tree and the tab order until it is shown, and sticky only
 * inside the report column. Destinations come from the filtered structure, so
 * a search can only remove links, never leave one pointing at nothing.
 */
export const PatchHubStickyNav = ({
  patchVersion,
  sections,
}: {
  patchVersion: string;
  sections: ReportSectionNode[];
}) => {
  const groups = useMemo(() => buildSrNavGroups(sections), [sections]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const hasDestinations = groups.length > 0;

  useLayoutEffect(() => {
    if (!hasDestinations) return;
    const root = document.documentElement;
    const previous = root.style.scrollPaddingTop;
    root.style.scrollPaddingTop = SCROLL_PADDING;
    return () => {
      root.style.scrollPaddingTop = previous;
    };
  }, [hasDestinations]);

  useEffect(() => {
    if (!hasDestinations) return;
    const anchors = srNavAnchors(groups);
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const sentinel = sentinelRef.current;
      const holder = holderRef.current;
      if (!sentinel || !holder) return;
      const holderTop = holder.getBoundingClientRect().top;
      setShown(isCondensedNavStuck(sentinel.getBoundingClientRect().top, holderTop));
      const boxes = new Map<string, MeasuredBox>();
      for (const anchor of anchors) {
        const rect = document.getElementById(anchor)?.getBoundingClientRect();
        if (rect) boxes.set(anchor, { anchor, top: rect.top, bottom: rect.bottom });
      }
      // From the holder, not the strip: the strip slides in with a transform, and a
      // probe taken mid-slide would drift by a few pixels and miss a freshly landed heading.
      setActive(activeSrAnchor(groups, boxes, holderTop + STRIP_HEIGHT + PROBE_GAP));
    };
    const schedule = () => {
      if (frame !== null) return;
      if (typeof window.requestAnimationFrame !== "function") return measure();
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== null) window.cancelAnimationFrame?.(frame);
    };
  }, [groups, hasDestinations]);

  // On a narrow strip, keep the current destination in view without moving the
  // page (scrollIntoView here could also scroll the document).
  useEffect(() => {
    const strip = stripRef.current;
    const link = active ? links.current.get(active) : undefined;
    if (shown && strip && link) revealInStrip(strip, link);
  }, [active, shown]);

  if (!hasDestinations) return null;

  const linkRef = (anchor: string) => (el: HTMLAnchorElement | null) => {
    if (el) links.current.set(anchor, el);
    else links.current.delete(anchor);
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" data-testid="patch-hub-sticky-sentinel" />
      <div
        ref={holderRef}
        data-testid="patch-hub-sticky-holder"
        className="sticky top-[calc(var(--app-header-h)+0.375rem)] z-30 h-0"
      >
        <nav
          aria-label="Main game sections"
          data-testid="patch-hub-sticky-nav"
          data-state={shown ? "shown" : "hidden"}
          // Inline so it also holds outside Tailwind (tests): hidden means out of
          // the accessibility tree and the tab order, not just transparent.
          style={{ visibility: shown ? "visible" : "hidden" }}
          className={`flex h-9 items-center gap-2 rounded-lg border border-border bg-card/90 px-2 text-xs shadow-sm backdrop-blur transition-[opacity,transform,visibility] duration-150 motion-reduce:transition-none ${
            shown ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          }`}
        >
          <span className="shrink-0 font-semibold tabular-nums text-[#c9a84c]">
            <span className="sr-only">Patch </span>
            {patchVersion}
          </span>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
          <ul
            ref={stripRef}
            onFocus={(event) => {
              if (event.target instanceof HTMLAnchorElement) revealInStrip(event.currentTarget, event.target);
            }}
            className="flex min-w-0 flex-1 items-center gap-x-2 overflow-x-auto px-1 py-1 max-sm:scroll-px-6 max-sm:pr-6 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)] [&::-webkit-scrollbar]:hidden"
          >
            {groups.map(({ section, buckets }) => (
              <li key={section.anchor} className="flex shrink-0 items-center gap-x-1">
                <DestinationLink
                  destination={section}
                  active={active === section.anchor}
                  linkRef={linkRef(section.anchor)}
                />
                {buckets.length > 0 && (
                  <ul className="flex items-center gap-x-1" aria-label={`${section.label} by direction`}>
                    {buckets.map((bucket) => (
                      <li key={bucket.anchor}>
                        <DestinationLink
                          destination={bucket}
                          active={active === bucket.anchor}
                          linkRef={linkRef(bucket.anchor)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <a
            href={`#${PATCH_HUB_TOP_ANCHOR}`}
            aria-label="Back to top"
            className={`${linkBase} min-w-6 shrink-0 justify-center gap-1 text-muted-foreground`}
          >
            <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
            <span aria-hidden="true" className="hidden sm:inline">
              Top
            </span>
          </a>
        </nav>
      </div>
    </>
  );
};
