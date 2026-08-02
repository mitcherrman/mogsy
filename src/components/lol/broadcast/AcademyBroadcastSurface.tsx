import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { BroadcastFeed, BroadcastTransmission } from "./broadcast-content";

/**
 * Academy Broadcast — the open magic-book surface.
 *
 * The visual: an open arcane tome, drawn entirely with CSS and the hub's own
 * palette — two leather-navy pages around a shadowed spine, a short stack of
 * page edges beneath, gold corner scrollwork, and a rune crest above the
 * content that glows with cyan energy while the Academy is transmitting.
 *
 * Deliberately independent of the audio store: everything it shows arrives as
 * props (`feed` from a content provider, `energized` from whoever composes the
 * centerpiece). Swapping the placeholder for a live feed later means changing
 * the `feed` prop, not this component and not the radio.
 */

type Variant = "desktop" | "mobile";

/** Two facing pages at desktop widths, a single stacked page on mobile. */
export default function AcademyBroadcastSurface({
  feed,
  energized = false,
  variant = "desktop",
  className,
}: {
  feed: BroadcastFeed;
  /** True while the radio is audibly playing — drives the rune/page glow. */
  energized?: boolean;
  variant?: Variant;
  className?: string;
}) {
  const reducedMotion = useReducedMotion() === true;
  const suffix = variant === "desktop" ? "" : "-mobile";
  const spread = variant === "desktop";

  return (
    <section
      aria-label="Academy Broadcast"
      data-testid={`academy-broadcast-surface${suffix}`}
      data-energized={energized ? "true" : "false"}
      className={cn("relative", className)}
    >
      {/* Ambient energy behind the tome. Pulses only while transmitting and
          only when motion is welcome; otherwise it holds a steady glow. */}
      <div
        aria-hidden
        className={cn(
          "absolute -inset-2 rounded-[18px] transition-opacity duration-700",
          energized ? "opacity-100" : "opacity-40",
          energized && !reducedMotion && "animate-pulse [animation-duration:3.2s]",
        )}
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(10,200,255,0.14) 0%, rgba(122,214,255,0.05) 55%, transparent 75%)",
          filter: "blur(6px)",
        }}
      />

      {/* The open tome */}
      <div
        className="relative overflow-hidden rounded-lg border border-[#c9a84c]/50"
        style={{
          boxShadow:
            "0 10px 26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(240,230,210,0.10)" +
            (energized ? ", 0 0 22px rgba(10,200,255,0.16)" : ""),
        }}
      >
        {/* Page faces. The spread shades each page toward a central spine; the
            single mobile page shades toward its bound edge instead. */}
        <div aria-hidden className="absolute inset-0">
          {spread ? (
            <>
              <div
                className="absolute inset-y-0 left-0 w-1/2"
                style={{
                  background:
                    "linear-gradient(105deg, #13223f 0%, #0e1a33 55%, #081226 100%)",
                }}
              />
              <div
                className="absolute inset-y-0 right-0 w-1/2"
                style={{
                  background:
                    "linear-gradient(255deg, #13223f 0%, #0e1a33 55%, #081226 100%)",
                }}
              />
              {/* Spine shadow */}
              <div
                className="absolute inset-y-0 left-1/2 w-10 -translate-x-1/2"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.55) 50%, transparent 100%)",
                }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(150deg, #13223f 0%, #0d1830 55%, #081226 100%)",
              }}
            />
          )}
          {/* Faint ruled-page texture */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              background:
                "repeating-linear-gradient(180deg, transparent 0 9px, #7ad6ff 9px 10px)",
            }}
          />
        </div>

        {/* Gold corner scrollwork */}
        {["left-1.5 top-1.5 border-l border-t", "right-1.5 top-1.5 border-r border-t", "left-1.5 bottom-1.5 border-l border-b", "right-1.5 bottom-1.5 border-r border-b"].map(
          (pos) => (
            <div
              key={pos}
              aria-hidden
              className={cn("absolute h-3 w-3 border-[#c9a84c]/70", pos)}
            />
          ),
        )}

        {/* The page content */}
        <div
          className={cn(
            "relative flex flex-col items-center justify-center px-5 text-center",
            spread ? "min-h-[clamp(150px,11.5vw,205px)] py-5" : "min-h-[9.5rem] py-5",
          )}
        >
          <BroadcastCrest energized={energized} still={reducedMotion} />
          <BroadcastBody feed={feed} />
        </div>
      </div>

      {/* Closed-page stack under the tome — the book's physical thickness. */}
      <div aria-hidden className="mx-2 h-[3px] rounded-b-sm bg-[#0d1830] border-x border-b border-[#c9a84c]/35" />
      <div aria-hidden className="mx-4 h-[3px] rounded-b-sm bg-[#0a1428] border-x border-b border-[#c9a84c]/25" />
    </section>
  );
}

/**
 * The rune crest above the content — the tome's transmitter. Lit cyan while
 * energized; its meaning is always duplicated by the text below, so the glow
 * is never the only signal.
 */
function BroadcastCrest({ energized, still }: { energized: boolean; still: boolean }) {
  return (
    <div aria-hidden className="mb-2 flex items-center gap-2">
      <span className="h-px w-8 bg-gradient-to-r from-transparent to-[#c9a84c]/60" />
      <span
        className={cn(
          "h-2 w-2 rotate-45 transition-colors duration-500",
          energized
            ? "bg-[#7ad6ff] shadow-[0_0_8px_rgba(122,214,255,0.9)]"
            : "bg-[#c9a84c]/40",
          energized && !still && "animate-pulse [animation-duration:2.4s]",
        )}
      />
      <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#c9a84c]/60" />
    </div>
  );
}

/** Draws whichever feed state arrived. Every state is a finished visual. */
function BroadcastBody({ feed }: { feed: BroadcastFeed }) {
  if (feed.status === "loading") {
    return (
      <BroadcastMessage eyebrow="Academy Broadcast" headline="Receiving transmission…" />
    );
  }
  if (feed.status === "empty") {
    return (
      <BroadcastMessage
        eyebrow="Academy Broadcast"
        headline="No transmissions right now"
        summary="New Academy broadcasts will appear here."
      />
    );
  }
  if (feed.status === "unavailable") {
    return (
      <BroadcastMessage
        eyebrow="Academy Broadcast"
        headline="Broadcast unavailable"
        summary="The Academy signal could not be reached. Check back later."
      />
    );
  }

  const transmission = feed.transmissions[feed.index] ?? feed.transmissions[0];
  if (!transmission) {
    return (
      <BroadcastMessage
        eyebrow="Academy Broadcast"
        headline="No transmissions right now"
        summary="New Academy broadcasts will appear here."
      />
    );
  }
  return (
    <>
      <BroadcastMessage
        eyebrow={transmission.eyebrow}
        headline={transmission.headline}
        summary={transmission.summary}
        timestamp={transmission.timestamp}
      />
      {(transmission.primaryAction || transmission.secondaryAction) && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {transmission.primaryAction && (
            <BroadcastActionLink action={transmission.primaryAction} primary />
          )}
          {transmission.secondaryAction && (
            <BroadcastActionLink action={transmission.secondaryAction} />
          )}
        </div>
      )}
      {feed.transmissions.length > 1 && (
        <div aria-hidden className="mt-3 flex items-center gap-1.5">
          {feed.transmissions.map((t, i) => (
            <span
              key={t.id}
              className={cn(
                "h-1 w-1 rounded-full",
                i === feed.index ? "bg-[#c9a84c]" : "bg-[#c9a84c]/30",
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}

function BroadcastMessage({
  eyebrow,
  headline,
  summary,
  timestamp,
}: {
  eyebrow: string;
  headline: string;
  summary?: string;
  timestamp?: string;
}) {
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#c9a84c]">
        {eyebrow}
      </p>
      <h2
        className="mt-1.5 text-balance text-base font-semibold leading-snug text-[#f0e6d2] lg:text-lg"
        style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
      >
        {headline}
      </h2>
      {summary && (
        <p className="mt-1.5 max-w-[26ch] text-xs leading-relaxed text-[#a09b8c]">
          {summary}
        </p>
      )}
      {timestamp && (
        <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[#7ad6ff]/70">
          {timestamp}
        </p>
      )}
    </>
  );
}

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
        "inline-flex min-h-[32px] items-center rounded-md px-3 py-1 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0ac8ff]",
        primary
          ? "bg-[#c9a84c]/20 text-[#f0d78c] hover:bg-[#c9a84c]/30"
          : "text-[#7ad6ff]/85 hover:text-[#7ad6ff]",
      )}
    >
      {action.label}
    </Link>
  );
}
