import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
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
    pager:
      feed.transmissions.length > 1
        ? { count: feed.transmissions.length, index: feed.index }
        : undefined,
  };
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

  return (
    <section
      aria-label="Academy Broadcast"
      data-testid={`academy-broadcast-surface${suffix}`}
      data-energized={energized ? "true" : "false"}
      // flex-col is load-bearing: it stops the img's negative vertical margins
      // from collapsing through this box, which would silently grow it back to
      // the full canvas and misalign every page-relative overlay coordinate.
      className={cn("relative flex flex-col", className)}
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
        {/* Left page — the headline. */}
        <div
          className="absolute flex flex-col items-center justify-center text-center"
          style={{ left: "8%", width: "38%", top: "15%", bottom: "13%" }}
        >
          {/* The desktop tiers track the box-width formula in LolHub
              (clamp(200px, 100vw−1030px, 380px)): the page region is ~95px at
              1280 and only reaches ~144px once the cap engages, so type may
              scale up only where the pages actually widen. */}
          <p
            className={cn(
              "font-bold uppercase tracking-[0.26em] text-[#6b5418]",
              desktop ? "text-[8px] min-[1500px]:text-[10px]" : "text-[9px]",
            )}
          >
            {view.eyebrow}
          </p>
          <h2
            className={cn(
              "mt-1.5 max-w-full text-balance font-semibold leading-snug text-[#1d2b47]",
              desktop ? "text-[10px] min-[1360px]:text-sm min-[1500px]:text-base" : "text-sm",
            )}
            style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
          >
            {view.headline}
          </h2>
        </div>

        {/* Right page — the detail. Empty for feeds with nothing to add; a
            blank parchment page is an intentional state for an open book. */}
        <div
          className="absolute flex flex-col items-center justify-center text-center"
          style={{ left: "54%", width: "38%", top: "15%", bottom: "13%" }}
        >
          {view.summary && (
            <p
              className={cn(
                "max-w-[24ch] leading-relaxed text-[#3f4a63]",
                desktop ? "text-[9px] min-[1360px]:text-[11px]" : "text-[11px]",
              )}
            >
              {view.summary}
            </p>
          )}
          {view.timestamp && (
            <p
              className={cn(
                "mt-1.5 uppercase tracking-[0.18em] text-[#176d93]",
                desktop ? "text-[8px] min-[1360px]:text-[10px]" : "text-[9px]",
              )}
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
      </div>
    </section>
  );
}

/** Action links restyled as ink on parchment. */
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
        "inline-flex min-h-[28px] items-center rounded-md px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176d93]",
        primary
          ? "bg-[#1d2b47]/10 text-[#1d2b47] hover:bg-[#1d2b47]/20"
          : "text-[#176d93] hover:text-[#0f5878]",
      )}
    >
      {action.label}
    </Link>
  );
}
