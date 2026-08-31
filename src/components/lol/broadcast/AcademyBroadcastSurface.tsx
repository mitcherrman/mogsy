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
const CQ = {
  eyebrow: "clamp(7px, 2.4cqw, 10px)",
  headlineBrief: "clamp(9px, 3.5cqw, 14px)",
  headlinePlain: "clamp(10px, 4cqw, 16px)",
  sectionHeading: "clamp(6.5px, 2.2cqw, 9px)",
  /** Fallback icon ramp (prose feeds / no brief): readable first. */
  icon: "clamp(14px, 6.4cqw, 28px)",
  iconGap: "clamp(2px, 1.1cqw, 6px)",
  sectionGap: "clamp(3px, 1.4cqw, 8px)",
  body: "clamp(9px, 2.9cqw, 11px)",
  meta: "clamp(8px, 2.6cqw, 10px)",
  actionText: "clamp(8.5px, 2.7cqw, 11px)",
  actionMinHeight: "clamp(20px, 7cqw, 28px)",
  /**
   * The band reserved for the patch title above BOTH pages in brief mode.
   * Reserving the same strip on the right page (which shows no title) is
   * what puts BUFFS and NERFS on the same eye line: generous enough for the
   * headlineBrief ramp (≤14px at ~1.375 line-height) plus its small margin.
   */
  titleReserve: "clamp(14px, 5.6cqw, 22px)",
} as const;

/* --------------------------------------------------- content-aware icons -- */

/** A page region is 38% of the tome's width; the icon gap eats ~1.3cqw. */
const PAGE_CQW = 36;
const GAP_CQW = 1.3;

/**
 * ONE shared icon size for the whole brief, derived from content density.
 *
 * The densest group decides it, so Buffs / Nerfs / Adjustments always draw at
 * the same size and the spread reads intentional. Per section we ask: how many
 * columns are needed so the icons wrap into at most `rows` rows on their page
 * (a page carrying two stacked sections gets fewer rows each, which is the
 * height guard). The widest column count wins; that count divides the page's
 * usable width into the shared cell size.
 *
 * Fewer icons → fewer columns → bigger cells (up to the cap); more icons →
 * more columns → the size shrinks only as far as needed, floored so icons
 * never go tiny. Purely a formula over counts: generic for any future patch.
 */
export function briefIconSizing(spread: {
  leftTop: PatchBriefSection | null;
  rightTop: PatchBriefSection | null;
  rightLower: PatchBriefSection[];
}): { columns: number; cqw: number; minPx: number; maxPx: number; css: string } {
  const pages = [
    [spread.leftTop].filter(Boolean) as PatchBriefSection[],
    [spread.rightTop, ...spread.rightLower].filter(Boolean) as PatchBriefSection[],
  ];

  let columns = 2;
  for (const page of pages) {
    // Rows the page can afford, split across the sections stacked on it.
    const rows = Math.max(1, Math.floor(6 / Math.max(1, page.length)));
    for (const section of page) {
      const n = section.entries.length;
      if (n === 0) continue;
      columns = Math.max(columns, Math.ceil(n / rows));
    }
  }
  columns = Math.min(columns, 6);

  const cqw = Math.round(((PAGE_CQW - (columns - 1) * GAP_CQW) / columns) * 10) / 10;
  // The cap tracks the ramp so a roomy grid can actually grow on a wide tome,
  // and a dense grid stays modest. The floor keeps icons legible.
  const maxPx = Math.min(48, Math.max(20, Math.round(cqw * 2.6)));
  const minPx = Math.min(14, maxPx);

  return { columns, cqw, minPx, maxPx, css: `clamp(${minPx}px, ${cqw}cqw, ${maxPx}px)` };
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
  const suffix = variant === "desktop" ? "" : "-mobile";
  const desktop = variant === "desktop";
  const view = feedView(feed);
  const spread = view.brief ? briefSpread(view.brief.sections) : null;
  const iconSize = spread ? briefIconSizing(spread).css : CQ.icon;


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
      className={cn("relative flex flex-col", className)}
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
        src={BOOK_SRC}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        data-testid={`academy-broadcast-book${suffix}`}
        className="pointer-events-none relative block w-[130.2%] max-w-none select-none ml-[-15.1%] mt-[-5.3%] mb-[-9.11%]"
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
                (left top) and NERFS (right top) open on the same eye line,
                and both pages close on the same baseline — CTA lower-left,
                Adjustments lower-right. justify-between holds those anchors
                no matter how many icons each grid wraps to. */}
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

            {/* Left page — BUFFS under the title, CTA at the base. The brief
                safe area (y 16.5–14.5%) stays tighter than the prose pages':
                the icon grids are the tallest content the book ever holds,
                and the extra margin keeps the title clear of the top ornament
                and the CTA clear of the painted bottom frame. */}
            <div
              className="absolute flex flex-col items-center justify-between text-center"
              style={{
                left: "8%",
                width: "38%",
                top: "16.5%",
                bottom: "14.5%",
                paddingTop: CQ.titleReserve,
              }}
            >
              {spread.leftTop ? (
                <PatchBriefSectionBlock section={spread.leftTop} />
              ) : (
                <div />
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

            {/* Right page — NERFS at the shared eye line, Adjustments at the
                base, mirroring the CTA's lower-left seat. */}
            <div
              className="absolute flex flex-col items-center justify-between text-center"
              style={{
                left: "54%",
                width: "38%",
                top: "16.5%",
                bottom: "14.5%",
                paddingTop: CQ.titleReserve,
              }}
            >
              {spread.rightTop ? (
                <PatchBriefSectionBlock section={spread.rightTop} />
              ) : (
                <div />
              )}
              {spread.rightLower.length > 0 ? (
                <div
                  className="flex w-full flex-col"
                  style={{ gap: CQ.sectionGap }}
                >
                  {spread.rightLower.map((section) => (
                    <PatchBriefSectionBlock key={section.direction} section={section} />
                  ))}
                </div>
              ) : (
                <div />
              )}
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
 * the wider mobile card with no variant branching: the icon grid REFLOWS
 * (flex-wrap) before the icons shrink, which is the stated priority.
 */
function PatchBriefSectionBlock({
  section,
  className,
}: {
  section: PatchBriefSection;
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
        style={{ fontSize: CQ.sectionHeading }}
      >
        {section.title}
      </p>
      <ul
        aria-label={`${section.title} this patch`}
        className="flex w-full flex-wrap items-center justify-center"
        style={{ marginTop: "2px", gap: CQ.iconGap }}
      >
        {section.entries.map((entry) => (
          <PatchBriefEntryIcon key={`${entry.entityType}:${entry.entityId}`} entry={entry} />
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
function PatchBriefEntryIcon({ entry }: { entry: PatchBriefEntry }) {
  const icon = (
    <img
      src={entry.iconUrl}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-[4px] border border-[#8a6d2a]/50 object-cover"
      style={{ width: CQ.icon, height: CQ.icon }}
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

