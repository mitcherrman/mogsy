// ---------------------------------------------------------------------------
// A team crest for the Pro Play surfaces OUTSIDE the matchup dossier.
//
// WHY THIS IS NOT A SECOND MEDIA SYSTEM. It performs no lookup of its own: it
// calls `useEntityMedia`, the same hook the dossier's slots call, reading the
// same batch the same `ProPlayMediaProvider` fetched. What differs is only
// presentation — the dossier's frames are styled by `.proplay-dossier
// .dossier-media` in index.css and render as parchment-era shields, which is
// right there and wrong in a search row. So the lookup stays in one place and
// the chrome is local to this file.
//
// SIZE IS AN ARGUMENT, NOT A DECISION MADE HERE. A crest is an identity cue,
// not the content: `xl` anchors a profile hero, `sm` sits in a search row, and
// nothing grew just because logos now exist.
//
// THE FRAME IS WHY DARK LOGOS STAY LEGIBLE. Several org marks are transparent
// PNGs with black or near-black glyphs — Dplus Kia's is literally white-on-
// nothing, Team Liquid's is a dark shield. On Mogzy's dark ground a bare
// transparent logo can vanish. Rather than touch the source image (which would
// destroy the only copy of the org's own artwork), every crest sits on a faint
// raised panel with a hairline border, so the mark always has something to
// stand against.
//
// GEOMETRY IS FIXED. The box is the same size whether art, a monogram or
// nothing-yet is inside it, so a slow media response cannot shift the layout
// under a reader's cursor, and a 404 degrades to the monogram rather than to a
// broken-image glyph.
// ---------------------------------------------------------------------------

import { useState } from "react";

import { useEntityMedia } from "./ProPlayMediaProvider";

export type CrestSize = "xs" | "sm" | "md" | "lg" | "xl";

const BOX: Record<CrestSize, string> = {
  xs: "h-6 w-6 rounded text-[8px]",
  sm: "h-8 w-8 rounded-md text-[9px]",
  md: "h-11 w-11 rounded-md text-[11px]",
  lg: "h-16 w-16 rounded-lg text-sm",
  xl: "h-20 w-20 rounded-xl text-base md:h-24 md:w-24",
};

/** Inner padding so a full-bleed wordmark does not touch the frame, and a
 *  square mark is not swallowed by it. Wide lockups need less. */
const PAD: Record<CrestSize, string> = {
  xs: "p-[3px]",
  sm: "p-1",
  md: "p-1.5",
  lg: "p-2",
  xl: "p-2.5",
};

/** Up to three characters of fallback. The org's own short code beats derived
 *  initials — "MKOI" is how Movistar KOI is actually written — and the
 *  monogram is the last resort. */
function crestLabel(name: string, shortCode?: string | null): string {
  const code = (shortCode ?? "").trim();
  if (code) return code.slice(0, 4).toUpperCase();
  const words = name
    .replace(/\(.*?\)/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function TeamCrest({
  teamKey,
  name,
  shortCode,
  size = "md",
  className,
}: {
  /** Canonical `esports_teams.lp_page`. An alias, a short code or a display
   *  name resolves to nothing — deliberately; see the media authority. */
  teamKey?: string | null;
  name: string;
  shortCode?: string | null;
  size?: CrestSize;
  className?: string;
}) {
  const { src } = useEntityMedia("team", teamKey);
  const [failed, setFailed] = useState(false);
  const showArt = Boolean(src) && !failed;
  const label = crestLabel(name, shortCode);

  return (
    <span
      data-testid="team-crest"
      data-media-state={showArt ? "art" : "placeholder"}
      title={name}
      aria-hidden="true"
      className={[
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        "border border-border/60 bg-muted/40",
        "font-semibold uppercase leading-none tracking-wide text-muted-foreground",
        BOX[size],
        showArt ? PAD[size] : "",
        className ?? "",
      ].join(" ")}
    >
      {showArt ? (
        <img
          src={src as string}
          alt=""
          loading="lazy"
          decoding="async"
          // CONTAIN, never cover: a crest is frequently a wide wordmark and
          // cropping one is worse than showing it small.
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}

/**
 * The player's own portrait slot — a monogram, today and deliberately.
 *
 * No player portrait is approved: the pilot's three are held as candidates with
 * their rights basis unestablished, so this component does not look media up at
 * all. It exists so a profile header has the same shape it will have when a
 * portrait one day IS approved, and so nobody is tempted to fill the gap with
 * the team's crest — a logo standing in for a face reads as a claim about the
 * person, and it is the wrong one.
 */
export function PlayerPortraitSlot({
  name,
  size = "lg",
  className,
}: {
  name: string;
  size?: CrestSize;
  className?: string;
}) {
  return (
    <span
      data-testid="player-portrait"
      data-media-state="placeholder"
      title={name}
      aria-hidden="true"
      className={[
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        "rounded-full border border-border/60 bg-muted/40",
        "font-semibold uppercase leading-none tracking-wide text-muted-foreground",
        BOX[size].replace(/rounded-\S+/, ""),
        className ?? "",
      ].join(" ")}
    >
      {crestLabel(name)}
    </span>
  );
}
