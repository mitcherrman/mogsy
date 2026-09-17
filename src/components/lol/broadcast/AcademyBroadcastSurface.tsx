import { useCallback, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type {
  PatchBrief,
  PatchBriefEntry,
  PatchBriefSection,
} from "@/lib/patch-reports/patch-brief";
import type { BroadcastFeed, BroadcastTransmission } from "./broadcast-content";

/**
 * Academy Broadcast — the open magic-book surface.
 *
 * The book is the owner-selected frame painting
 * (public/images/lol-hub/academy-broadcast-book.png, 1536×1024 RGBA): an
 * ornate navy-and-gold frame with cyan gemstones around two light parchment
 * pages. The painting is purely decorative chrome — every word of broadcast
 * content stays live HTML layered over the pages, so a future feed (and a
 * screen reader) never depends on pixels.
 *
 * Deliberately independent of the audio store: everything it shows arrives as
 * props (`feed` from a content provider, `energized` from whoever composes the
 * centerpiece). Swapping the placeholder for a live feed later means changing
 * the `feed` prop, not this component and not the radio.
 *
 * Geometry (measured from the PNG's alpha/pixel data):
 *   drawn book bbox   x 11.6–88.4%, y 6.1–89.5% of the canvas
 *   central spine     x ≈ 48.5–51.5% of the canvas
 * The negative margins below reclaim ALL of the transparent padding so this
 * component's LAYOUT BOX EQUALS THE DRAWN BOOK — the radio dock hangs from
 * the real painted base and the hub's width budget buys visible book, not
 * empty pixels. Derivation (every % resolves against the box width B):
 *   canvas width  = B / 0.768            → img width 130.2%
 *   left padding  = 0.116 · canvas       → margin-left  −15.1%
 *   top padding   = 0.061 · canvasH      → margin-top   −5.3%   (canvasH = ⅔·canvas)
 *   bottom pad    = 0.105 · canvasH      → margin-bottom −9.11%
 * Overlay coordinates are then fractions OF THE DRAWN BOOK: the pages' safe
 * area maps to x 8–92% / y 15–87%, and the spine to x 48–52%.
 */

type Variant = "desktop" | "mobile";

const BOOK_SRC = "/images/lol-hub/academy-broadcast-book.png";

/**
 * The painting's intrinsic pixels, declared so the browser can RESERVE the
 * tome's height before a single byte of it arrives.
 *
 * This is load-bearing, not metadata. The img carries a definite CSS width
 * (`w-[130.2%]`) and no intrinsic ratio, so before load its height was 0 —
 * and because this section is `flex flex-col`, the whole centerpiece
 * collapsed with it. Measured on the pre-load frame: the surface and the
 * absolute overlay were 362×0, the radio dock sat at y=127 instead of y=389,
 * and the sixteen patch icons — sized in `cqw`, which depends only on WIDTH
 * and so resolved immediately — rendered at full size inside a zero-height
 * box, floating over the library until the PNG landed and shoved them 44px
 * down. With the attributes present the UA derives `aspect-ratio: 3 / 2`,
 * the height is known at first paint, and nothing moves.
 */
const BOOK_INTRINSIC = { width: 1536, height: 1024 } as const;

/**
 * One flat view over every feed state, so the two page regions render from a
 * single shape: headline page (left) and detail page (right). A state screen
 * is simply a transmission with no actions — a blank right page reads as an
 * open book, not as a broken layout.
 */
function feedView(feed: BroadcastFeed): {
  eyebrow: string;
  headline: string;
  summary?: string;
  timestamp?: string;
  primaryAction?: BroadcastTransmission["primaryAction"];
  secondaryAction?: BroadcastTransmission["secondaryAction"];
  pager?: { count: number; index: number };
  brief?: PatchBrief;
} {
  if (feed.status === "loading") {
    return { eyebrow: "Academy Broadcast", headline: "Receiving transmission…" };
  }
  if (feed.status === "empty") {
    return {
      eyebrow: "Academy Broadcast",
      headline: "No transmissions right now",
      summary: "New Academy broadcasts will appear here.",
    };
  }
  if (feed.status === "unavailable") {
    return {
      eyebrow: "Academy Broadcast",
      headline: "Broadcast unavailable",
      summary: "The Academy signal could not be reached. Check back later.",
    };
  }
  const t = feed.transmissions[feed.index] ?? feed.transmissions[0];
  if (!t) {
    return {
      eyebrow: "Academy Broadcast",
      headline: "No transmissions right now",
      summary: "New Academy broadcasts will appear here.",
    };
  }
  return {
    eyebrow: t.eyebrow,
    headline: t.headline,
    summary: t.summary,
    timestamp: t.timestamp,
    primaryAction: t.primaryAction,
    secondaryAction: t.secondaryAction,
    brief: t.brief,
    pager:
      feed.transmissions.length > 1
        ? { count: feed.transmissions.length, index: feed.index }
        : undefined,
  };
}

/* ------------------------------------------------------------------ sizing -- */

/**
 * RESPONSIVE MODEL — container queries, not viewport breakpoints.
 *
 * What decides whether this content fits is the tome's own width, which the
 * hub computes from viewport width AND height (academy-layout.ts). Viewport
 * media queries (the old min-[1360px] / min-[1500px] tiers) were the wrong
 * signal: a 1366×768 laptop and a 1920×1080 desktop can hand the surface very
 * different widths. The section declares `container-type: inline-size`, so
 * every size below is a bounded fluid ramp in `cqw` (% of the tome's width)
 * with a readability floor and a cap — one rule, no tier snapping, and icons
 * stay the priority: they get the most generous ramp on the page.
 *
 * The floors are what the 200px-lane worst case can afford; the caps are the
 * approved wide-desktop values.
 */
const BRIEF_METRICS = {
  sectionHeading: { min: 6.5, cqw: 2.2, max: 9 },
  iconGap: { min: 2, cqw: 1.1, max: 6 },
  sectionGap: { min: 3, cqw: 1.4, max: 8 },
  actionMinHeight: { min: 20, cqw: 7, max: 28 },
  titleReserve: { min: 14, cqw: 5.6, max: 22 },
  sectionHeadingLineHeight: 1.2,
  gridHeadingGap: 2,
} as const;

const fluidCss = ({ min, cqw, max }: { min: number; cqw: number; max: number }) =>
  `clamp(${min}px, ${cqw}cqw, ${max}px)`;
const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));
const metricPx = (
  metric: { min: number; cqw: number; max: number },
  bookWidth: number,
) => clamp(metric.min, metric.cqw / 100 * bookWidth, metric.max);

const CQ = {
  eyebrow: "clamp(7px, 2.4cqw, 10px)",
  headlineBrief: "clamp(9px, 3.5cqw, 14px)",
  headlinePlain: "clamp(10px, 4cqw, 16px)",
  sectionHeading: fluidCss(BRIEF_METRICS.sectionHeading),
  /** Fallback icon ramp (prose feeds / no brief): readable first. */
  icon: "clamp(14px, 6.4cqw, 28px)",
  iconGap: fluidCss(BRIEF_METRICS.iconGap),
  sectionGap: fluidCss(BRIEF_METRICS.sectionGap),
  body: "clamp(9px, 2.9cqw, 11px)",
  meta: "clamp(8px, 2.6cqw, 10px)",
  actionText: "clamp(8.5px, 2.7cqw, 11px)",
  actionMinHeight: fluidCss(BRIEF_METRICS.actionMinHeight),
  /**
   * The band reserved for the patch title above BOTH pages in brief mode.
   * Reserving the same strip on the right page (which shows no title) is
   * what puts BUFFS and NERFS on the same eye line: generous enough for the
   * headlineBrief ramp (≤14px at ~1.375 line-height) plus its small margin.
   */
  titleReserve: fluidCss(BRIEF_METRICS.titleReserve),
} as const;

/* --------------------------------------------------- content-aware icons -- */

/**
 * Conservative dimensions of the measured parchment region, expressed against
 * the drawn-book width.  The surface itself is 0.723 × book width high; the
 * brief pages run from 16.5% to 85.5% of that surface, with a 36cqw usable
 * page width.  Keeping the solver in the book's coordinate system means it
 * follows the actual query container rather than a viewport tier.
 */
const PAGE_CQW = 36;
const SURFACE_HEIGHT_PER_WIDTH = 0.723;
const BRIEF_SAFE_HEIGHT_CQW = (0.855 - 0.165) * SURFACE_HEIGHT_PER_WIDTH * 100;
const MIN_BOOK_WIDTH_PX = 200;
const ICON_FLOOR_PX = 10;
const ICON_CAP_PX = 48;
const MAX_COLUMNS = 6;

type BriefSpread = {
  leftTop: PatchBriefSection | null;
  rightTop: PatchBriefSection | null;
  rightLower: PatchBriefSection[];
};

type BriefIconSizing = {
  columns: number;
  cqw: number;
  minPx: number;
  maxPx: number;
  css: string;
};

const iconGapPx = (bookWidth: number) => metricPx(BRIEF_METRICS.iconGap, bookWidth);
const sectionGapPx = (bookWidth: number) => metricPx(BRIEF_METRICS.sectionGap, bookWidth);
const headingHeightPx = (bookWidth: number) =>
  metricPx(BRIEF_METRICS.sectionHeading, bookWidth) * BRIEF_METRICS.sectionHeadingLineHeight;
const titleReservePx = (bookWidth: number) => metricPx(BRIEF_METRICS.titleReserve, bookWidth);
const actionHeightPx = (bookWidth: number) => metricPx(BRIEF_METRICS.actionMinHeight, bookWidth);

function pagesFor(spread: BriefSpread): PatchBriefSection[][] {
  return [
    [spread.leftTop].filter(Boolean) as PatchBriefSection[],
    [spread.rightTop, ...spread.rightLower].filter(Boolean) as PatchBriefSection[],
  ];
}

/** Maximum icon edge which fits a page's stacked headings and grids. */
function pageIconLimitPx(
  page: PatchBriefSection[],
  columns: number,
  bookWidth: number,
  hasAction = false,
): number {
  if (page.length === 0) return Infinity;
  const gap = iconGapPx(bookWidth);
  const fixedHeight =
    page.length * (headingHeightPx(bookWidth) + BRIEF_METRICS.gridHeadingGap) +
    Math.max(0, page.length - 1 + (hasAction ? 1 : 0)) * sectionGapPx(bookWidth) +
    (hasAction ? actionHeightPx(bookWidth) : 0) +
    page.reduce((total, section) => total + Math.max(0, Math.ceil(section.entries.length / columns) - 1) * gap, 0);
  const rows = page.reduce((total, section) => total + Math.ceil(section.entries.length / columns), 0);
  const available = BRIEF_SAFE_HEIGHT_CQW / 100 * bookWidth - titleReservePx(bookWidth);
  return rows > 0 ? (available - fixedHeight) / rows : Infinity;
}

function iconLimitPx(spread: BriefSpread, columns: number, bookWidth: number, hasAction: boolean): number {
  const widthLimit =
    (PAGE_CQW / 100 * bookWidth - Math.max(0, columns - 1) * iconGapPx(bookWidth)) / columns;
  return Math.min(
    widthLimit,
    ...pagesFor(spread).map((page, index) => pageIconLimitPx(page, columns, bookWidth, index === 0 && hasAction)),
  );
}

/**
 * ONE shared icon size for the whole brief, derived from content density.
 *
 * The densest page decides it, so Buffs / Nerfs / Adjustments always draw at
 * the same size and the spread reads intentional. The solver tries explicit
 * column counts and charges each candidate for its headings, grid rows, title
 * reserve, grid gaps, and between-section gaps inside the measured parchment
 * height as well as for its usable page width.
 *
 * Fewer icons → fewer columns → bigger cells (up to the cap); more icons →
 * more columns → the size shrinks only as far as needed, floored so icons
 * never go tiny. Purely a formula over counts: generic for any future patch.
 */
export function briefIconSizing(spread: BriefSpread, { hasAction = true }: { hasAction?: boolean } = {}): BriefIconSizing {
  /**
   * Select the column count that yields the largest shared icon at the
   * narrowest supported tome.  More columns are considered before shrinking
   * icons; each candidate must pay for every stacked section heading, every
   * grid row, the title reserve, and both kinds of gaps.  The resulting cqw
   * ramp is safe at the 200px floor and grows with the container to the same
   * bounded cap everywhere else.
   */
  let best = { columns: 2, iconPx: -Infinity };
  for (let columns = 2; columns <= MAX_COLUMNS; columns += 1) {
    const limit = iconLimitPx(spread, columns, MIN_BOOK_WIDTH_PX, hasAction);
    const iconPx = Math.min(ICON_CAP_PX, limit);
    if (iconPx >= ICON_FLOOR_PX && iconPx > best.iconPx) best = { columns, iconPx };
  }

  // Pathological future feeds can exceed even six compact columns. Keep the
  // grid deterministic and truthful rather than silently overflowing: choose
  // the best candidate and allow the bounded floor to be the final guard.
  if (!Number.isFinite(best.iconPx)) {
    best = {
      columns: MAX_COLUMNS,
      iconPx: Math.max(ICON_FLOOR_PX, iconLimitPx(spread, MAX_COLUMNS, MIN_BOOK_WIDTH_PX, hasAction)),
    };
  }

  // Round down: this value becomes CSS, so rounding to nearest could turn a
  // mathematically exact fit into a fractional-pixel overflow at the floor.
  const cqw = Math.floor((best.iconPx / MIN_BOOK_WIDTH_PX) * 1000) / 10;
  return {
    columns: best.columns,
    cqw,
    minPx: ICON_FLOOR_PX,
    maxPx: ICON_CAP_PX,
    css: `clamp(${ICON_FLOOR_PX}px, ${cqw}cqw, ${ICON_CAP_PX}px)`,
  };
}

/**
 * Testable geometry twin of the CSS layout.  It reports the smallest bottom
 * clearance across both parchment pages for a concrete rendered book width.
 * The supported centerpiece range comes from academy-layout.ts.
 */
export function briefGeometryAt(
  spread: BriefSpread,
  bookWidth: number,
  { hasAction = true }: { hasAction?: boolean } = {},
) {
  const sizing = briefIconSizing(spread, { hasAction });
  const iconPx = clamp(sizing.minPx, sizing.cqw / 100 * bookWidth, sizing.maxPx);
  const pageHeights = pagesFor(spread).map((page, index) => {
    const rows = page.reduce((total, section) => total + Math.ceil(section.entries.length / sizing.columns), 0);
    const height =
      page.length * (headingHeightPx(bookWidth) + BRIEF_METRICS.gridHeadingGap) +
      Math.max(0, page.length - 1 + (index === 0 && hasAction ? 1 : 0)) * sectionGapPx(bookWidth) +
      (index === 0 && hasAction ? actionHeightPx(bookWidth) : 0) +
      rows * iconPx +
      page.reduce((total, section) => total + Math.max(0, Math.ceil(section.entries.length / sizing.columns) - 1) * iconGapPx(bookWidth), 0);
    return height;
  });
  const availableHeight = BRIEF_SAFE_HEIGHT_CQW / 100 * bookWidth - titleReservePx(bookWidth);
  return { ...sizing, iconPx, availableHeight, pageHeights, bottomClearance: Math.min(...pageHeights.map((height) => availableHeight - height)) };
}

/**
 * Assign the brief's sections to the MIRRORED spread:
 *
 *   LEFT  page top  ← Buffs            RIGHT page top  ← Nerfs
 *   LEFT  page base ← the CTA          RIGHT page       ← Adjustments, stacked
 *                                                        directly under Nerfs
 *
 * The projection always orders Buffs → Nerfs → Adjustments, so this is a
 * role lookup, never entity- or count-specific: any future patch with the
 * same three directions lands identically, and icon counts only affect how
 * each grid wraps within its own page. Without a Buffs section the next
 * section leads the left page so it never reads empty.
 */
export function briefSpread(sections: PatchBriefSection[]): {
  leftTop: PatchBriefSection | null;
  rightTop: PatchBriefSection | null;
  rightLower: PatchBriefSection[];
} {
  const buff = sections.find((s) => s.direction === "buff") ?? null;
  const nerf = sections.find((s) => s.direction === "nerf") ?? null;
  const rest = sections.filter((s) => s !== buff && s !== nerf);
  if (buff) {
    return {
      leftTop: buff,
      rightTop: nerf ?? rest[0] ?? null,
      rightLower: nerf ? rest : rest.slice(1),
    };
  }
  const [first, ...tail] = sections;
  return { leftTop: first ?? null, rightTop: null, rightLower: tail };
}



export default function AcademyBroadcastSurface({
  feed,
  energized = false,
  variant = "desktop",
  className,
}: {
  feed: BroadcastFeed;
  /** True while the radio is audibly playing — drives the gemstone-energy glow. */
  energized?: boolean;
  variant?: Variant;
  className?: string;
}) {
  const reducedMotion = useReducedMotion() === true;
  /**
   * Reveal gate. The geometry above is already reserved, so this is NOT
   * fighting layout shift — it exists so the composed tome appears as one
   * object instead of live patch content briefly sitting on bare library.
   * A ref callback rather than `onLoad` alone: a cached image can already be
   * `complete` before React attaches the handler, and that must not strand
   * the centerpiece invisible. `onError` opens the gate too — a missing
   * painting shows the content over nothing, which is far better than
   * showing nothing at all.
   */
  const [chromeReady, setChromeReady] = useState(false);
  const bookRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete) setChromeReady(true);
  }, []);
  const suffix = variant === "desktop" ? "" : "-mobile";
  const desktop = variant === "desktop";
  const view = feedView(feed);
  const spread = view.brief ? briefSpread(view.brief.sections) : null;
  const iconSizing = spread
    ? briefIconSizing(spread, { hasAction: Boolean(view.primaryAction || view.secondaryAction) })
    : null;
  const iconSize = iconSizing?.css ?? CQ.icon;


  return (
    <section
      aria-label="Academy Broadcast"
      data-testid={`academy-broadcast-surface${suffix}`}
      data-energized={energized ? "true" : "false"}
      // flex-col is load-bearing: it stops the img's negative vertical margins
      // from collapsing through this box, which would silently grow it back to
      // the full canvas and misalign every page-relative overlay coordinate.
      // container-type: inline-size makes THIS box the query container, so all
      // page typography/icon sizing below resolves against the tome's real
      // width instead of the viewport (see the CQ ramp above).
      data-chrome-ready={chromeReady ? "true" : "false"}
      className={cn(
        "relative flex flex-col",
        // The whole assembled tome — painting, ink and icons — fades in
        // together. Geometry is reserved either way, so this only ever
        // changes what is PAINTED, never where anything sits.
        "transition-opacity duration-[260ms] ease-out motion-reduce:transition-none",
        chromeReady ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{ containerType: "inline-size" }}
    >

      {/* Ambient energy behind the tome — it halos the painted silhouette
          through the PNG's transparent exterior. Pulses only while
          transmitting and only when motion is welcome; otherwise it holds a
          steady glow. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-[-6%] inset-y-[-8%] transition-opacity duration-700",
          energized ? "opacity-100" : "opacity-35",
          energized && !reducedMotion && "animate-pulse [animation-duration:3.2s]",
        )}
        style={{
          background:
            "radial-gradient(ellipse 62% 58% at 50% 46%, rgba(10,200,255,0.16) 0%, rgba(122,214,255,0.06) 55%, transparent 75%)",
          filter: "blur(8px)",
        }}
      />

      {/* The painted book. Decorative only: empty alt + aria-hidden, and the
          negative margins reclaim the canvas's transparent padding (see the
          derivation above) so the section box IS the drawn book. */}
      <img
        ref={bookRef}
        src={BOOK_SRC}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        width={BOOK_INTRINSIC.width}
        height={BOOK_INTRINSIC.height}
        onLoad={() => setChromeReady(true)}
        onError={() => setChromeReady(true)}
        data-testid={`academy-broadcast-book${suffix}`}
        className="pointer-events-none relative block h-auto w-[130.2%] max-w-none select-none ml-[-15.1%] mt-[-5.3%] mb-[-9.11%]"
        style={{
          filter: energized
            ? "drop-shadow(0 10px 22px rgba(0,0,0,0.55)) drop-shadow(0 0 16px rgba(10,200,255,0.28))"
            : "drop-shadow(0 10px 22px rgba(0,0,0,0.55))",
          transition: "filter 700ms ease",
        }}
      />

      {/* Live content over the parchment pages. Two regions — one per page —
          leave the ornate frame and the x 48–52% spine band untouched, and the
          light pages take dark-navy ink rather than the app's light-on-dark
          type. */}
      <div className="absolute inset-0">
        {spread ? (
          <>
            {/* MIRRORED BRIEF SPREAD. The patch title is the one intentional
                asymmetry: it floats in a band reserved above the LEFT page
                only. Both pages pad down by the same title band, so BUFFS
                (left top) and NERFS (right top) open on the same eye line.
                The right page then STACKS its sections top-down (Adjustments
                reads as the next subsection under Nerfs, not a detached
                lower-right island), while the left page keeps the CTA below
                its Buffs block. Icon size is one shared, content-aware ramp
                (briefIconSizing) so both pages use the parchment fully. */}
            <h2
              className="absolute text-center font-semibold leading-snug text-[#1d2b47]"
              style={{
                left: "8%",
                width: "38%",
                top: "16.5%",
                fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif',
                fontSize: CQ.headlineBrief,
              }}
            >
              {view.headline}
            </h2>

            {/* Left page — BUFFS under the title, CTA beneath it. The brief
                safe area (y 16.5–14.5%) stays tighter than the prose pages':
                the icon grids are the tallest content the book ever holds,
                and the extra margin keeps the title clear of the top ornament
                and the CTA clear of the painted bottom frame. */}
            <div
              className="absolute flex flex-col items-center text-center"
              style={{
                left: "8%",
                width: "38%",
                top: "16.5%",
                bottom: "14.5%",
                paddingTop: CQ.titleReserve,
                gap: CQ.sectionGap,
              }}
            >
              {spread.leftTop && (
                <PatchBriefSectionBlock
                  section={spread.leftTop}
                  columns={iconSizing!.columns}
                  iconSize={iconSize}
                />
              )}
              {(view.primaryAction || view.secondaryAction) && (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {view.primaryAction && (
                    <BroadcastActionLink action={view.primaryAction} primary />
                  )}
                  {view.secondaryAction && (
                    <BroadcastActionLink action={view.secondaryAction} />
                  )}
                </div>
              )}
            </div>

            {/* Right page — NERFS at the shared eye line, then Adjustments
                directly beneath at a normal section gap. */}
            <div
              className="absolute flex flex-col items-center text-center"
              style={{
                left: "54%",
                width: "38%",
                top: "16.5%",
                bottom: "14.5%",
                paddingTop: CQ.titleReserve,
                gap: CQ.sectionGap,
              }}
            >
              {spread.rightTop && (
                <PatchBriefSectionBlock
                  section={spread.rightTop}
                  columns={iconSizing!.columns}
                  iconSize={iconSize}
                />
              )}
              {spread.rightLower.map((section) => (
                <PatchBriefSectionBlock
                  key={section.direction}
                  section={section}
                  columns={iconSizing!.columns}
                  iconSize={iconSize}
                />
              ))}
            </div>

          </>
        ) : (
          <>
            {/* Prose feeds: headline page (left) and detail page (right). A
                blank right page is an intentional state for an open book. */}
            <div
              className="absolute flex flex-col items-center justify-center text-center"
              style={{ left: "8%", width: "38%", top: "15%", bottom: "13%" }}
            >
              {/* Every size here is container-relative (CQ ramp above): the
                  page region is 38% of the tome, so the same rule works at a
                  200px lane and at the 380px cap without breakpoint snapping. */}
              <p
                className="font-bold uppercase tracking-[0.26em] text-[#6b5418]"
                style={{ fontSize: CQ.eyebrow }}
              >
                {view.eyebrow}
              </p>
              <h2
                className="mt-1.5 max-w-full text-balance font-semibold leading-snug text-[#1d2b47]"
                style={{
                  fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif',
                  fontSize: CQ.headlinePlain,
                }}
              >
                {view.headline}
              </h2>
            </div>

            <div
              className="absolute flex flex-col items-center justify-center text-center"
              style={{ left: "54%", width: "38%", top: "15%", bottom: "13%" }}
            >
              {view.summary && (
                <p
                  className="max-w-[24ch] leading-relaxed text-[#3f4a63]"
                  style={{ fontSize: CQ.body }}
                >
                  {view.summary}
                </p>
              )}
              {view.timestamp && (
                <p
                  className="mt-1.5 uppercase tracking-[0.18em] text-[#176d93]"
                  style={{ fontSize: CQ.meta }}
                >
                  {view.timestamp}
                </p>
              )}
              {(view.primaryAction || view.secondaryAction) && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  {view.primaryAction && (
                    <BroadcastActionLink action={view.primaryAction} primary />
                  )}
                  {view.secondaryAction && (
                    <BroadcastActionLink action={view.secondaryAction} />
                  )}
                </div>
              )}
              {view.pager && (
                <div aria-hidden className="mt-2 flex items-center gap-1.5">
                  {Array.from({ length: view.pager.count }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1 w-1 rounded-full",
                        i === view.pager!.index ? "bg-[#8a6d2a]" : "bg-[#8a6d2a]/35",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Ink colors for the three section headings. The heading TEXT carries the
 * meaning (direction is never color-alone); colors just echo it.
 */
const SECTION_HEADING_INK: Record<PatchBriefSection["direction"], string> = {
  buff: "text-[#1f6b33]",
  nerf: "text-[#8f2c2c]",
  adjustment: "text-[#6b5418]",
};

/**
 * One direction group: a heading (BUFFS / NERFS / ADJUSTMENTS) above an
 * icon-only grid. Only non-empty sections ever reach this component — the
 * projection drops empty ones, so no empty heading can render.
 *
 * Sizing is container-relative, so the same block serves the desktop tome and
 * the wider mobile card with no variant branching: the shared solver selects
 * explicit grid columns before it materially shrinks the icons.
 */
function PatchBriefSectionBlock({
  section,
  columns,
  iconSize = CQ.icon,
  className,
}: {
  section: PatchBriefSection;
  /** Shared explicit grid width selected by the parchment-fit solver. */
  columns?: number;
  /** Shared content-aware icon ramp for the whole brief (briefIconSizing). */
  iconSize?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={`patch-brief-section-${section.direction}`}
      className={cn("flex w-full flex-col items-center", className)}
    >
      <p
        className={cn(
          "font-bold uppercase tracking-[0.22em]",
          SECTION_HEADING_INK[section.direction],
        )}
        style={{
          fontSize: CQ.sectionHeading,
          lineHeight: BRIEF_METRICS.sectionHeadingLineHeight,
        }}
      >
        {section.title}
      </p>
      <ul
        aria-label={`${section.title} this patch`}
        className="w-full justify-center"
        style={{
          marginTop: "2px",
          gap: CQ.iconGap,
          display: columns ? "grid" : "flex",
          gridTemplateColumns: columns ? `repeat(${columns}, ${iconSize})` : undefined,
        }}
      >
        {section.entries.map((entry) => (
          <PatchBriefEntryIcon
            key={`${entry.entityType}:${entry.entityId}`}
            entry={entry}
            iconSize={iconSize}
          />
        ))}
      </ul>
    </div>
  );
}


/**
 * One entity icon. THE product rule lives here: the icon is the only visible
 * identity — the entity name appears solely as the link's aria-label (or an
 * sr-only span when there is no docs route), never as visible text, a
 * `title` attribute, or a tooltip. A failed icon shows nothing (empty alt),
 * never a name.
 *
 * Size is the CQ ramp's most generous term (14px floor → 28px cap): icons are
 * the content, so they are the last thing the layout gives up.
 */
function PatchBriefEntryIcon({
  entry,
  iconSize = CQ.icon,
}: {
  entry: PatchBriefEntry;
  iconSize?: string;
}) {
  const icon = (
    <img
      src={entry.iconUrl}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-[4px] border border-[#8a6d2a]/50 object-cover"
      // Mirrored as data for tests: jsdom's CSSOM discards container-unit
      // clamps, so the resolved ramp would be invisible to assertions.
      data-brief-icon-size={iconSize}
      style={{ width: iconSize, height: iconSize }}
    />
  );
  return (
    <li data-testid={`patch-brief-${entry.entityType}-icon`} className="flex">
      {entry.docsHref ? (
        <Link
          to={entry.docsHref}
          aria-label={`Open ${entry.accessibleName} in League Docs`}
          className="rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176d93]"
        >
          {icon}
        </Link>
      ) : (
        <span>
          {icon}
          <span className="sr-only">{entry.accessibleName}</span>
        </span>
      )}
    </li>
  );
}

/** Action links restyled as ink on parchment (container-relative footprint). */
function BroadcastActionLink({
  action,
  primary = false,
}: {
  action: { label: string; to: string };
  primary?: boolean;
}) {
  return (
    <Link
      to={action.to}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0 font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176d93]",
        primary
          ? "bg-[#1d2b47]/10 text-[#1d2b47] hover:bg-[#1d2b47]/20"
          : "text-[#176d93] hover:text-[#0f5878]",
      )}
      style={{ fontSize: CQ.actionText, minHeight: CQ.actionMinHeight }}
    >
      {action.label}
    </Link>
  );
}

