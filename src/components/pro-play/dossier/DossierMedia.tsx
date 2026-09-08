// ---------------------------------------------------------------------------
// Media slots for the matchup dossier — team crests, player portraits and
// champion icons.
//
// WE DO NOT HAVE TEAM OR PLAYER MEDIA YET. Sourcing it is a later workstream,
// so the point of this file is to make the ABSENCE deliberate: a slot that is
// empty must look like a designed frame with a monogram in it, never like an
// image that failed. Three rules follow from that:
//
// 1. No `<img>` is ever rendered without a source. A broken-image glyph is the
//    one thing these frames exist to prevent.
// 2. The fallback is derived from the name we already have — initials for a
//    person or a team, a glyph for a champion we hold no art for. It is
//    deterministic, so the same team wears the same monogram on every screen.
// 3. The frame geometry is identical whether or not art is present, so
//    dropping real media in later changes the picture and nothing else — no
//    reflow, no layout pass, no second design.
//
// Champion icons are the exception: those we DO have, out of the Combat API's
// champion asset store, and `getChampionSquareIconUrl` already returns null
// for a champion it has no art for — which lands on the same fallback path.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Shield, Swords, User } from "lucide-react";

import { getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";

/** Up to two letters from a name, for an empty frame. "Gen.G" -> "GG",
 *  "Bin (Chen Ze-Bin)" -> "B", "Hanwha Life Esports" -> "HL". */
export function monogram(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

type SlotSize = "sm" | "md" | "lg";

const BOX: Record<SlotSize, string> = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-12 w-12 text-xs",
  lg: "h-16 w-16 text-sm md:h-20 md:w-20 md:text-base",
};

/**
 * The shared frame. `src` is optional on purpose — the empty state is the
 * common one today and has to be the well-designed one.
 */
function MediaFrame({
  src,
  alt,
  fallback,
  size,
  shape,
  testId,
}: {
  src?: string | null;
  alt: string;
  fallback: React.ReactNode;
  size: SlotSize;
  shape: "shield" | "round" | "square";
  testId: string;
}) {
  // An asset that 404s must degrade to the monogram, not to a broken glyph.
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={[
        "dossier-media",
        `dossier-media--${shape}`,
        BOX[size],
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        "font-semibold uppercase tracking-wide",
      ].join(" ")}
      data-testid={testId}
      data-media-state={showImage ? "art" : "placeholder"}
      aria-hidden={showImage ? undefined : true}
      title={alt}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

/** A team crest slot. Empty today; shaped for a crest. */
export function TeamCrest({
  name,
  shortCode,
  size = "lg",
  src,
}: {
  name: string;
  shortCode?: string | null;
  size?: SlotSize;
  src?: string | null;
}) {
  // The owner's short label is a better monogram than initials when we have
  // it — "BLG" is how the team is actually known.
  const label = (shortCode || monogram(name)).slice(0, 4);
  return (
    <MediaFrame
      src={src}
      alt={name}
      size={size}
      shape="shield"
      testId="team-crest"
      fallback={
        <span className="flex flex-col items-center leading-none">
          <Shield className="mb-0.5 h-3 w-3 opacity-40" aria-hidden="true" />
          <span>{label}</span>
        </span>
      }
    />
  );
}

/** A player portrait slot. Empty today; shaped for a head-and-shoulders crop. */
export function PlayerPortrait({
  name,
  size = "md",
  src,
}: {
  name: string;
  size?: SlotSize;
  src?: string | null;
}) {
  return (
    <MediaFrame
      src={src}
      alt={name}
      size={size}
      shape="round"
      testId="player-portrait"
      fallback={
        <span className="flex flex-col items-center leading-none">
          <User className="mb-0.5 h-3 w-3 opacity-40" aria-hidden="true" />
          <span>{monogram(name)}</span>
        </span>
      }
    />
  );
}

/**
 * A champion icon. Unlike the two above this usually RESOLVES — the Combat
 * API's champion asset store is already in production — but a champion it has
 * no art for returns null and lands on the same monogram frame.
 */
export function ChampionIcon({
  champion,
  size = "sm",
  muted,
}: {
  champion: string;
  size?: SlotSize;
  muted?: boolean;
}) {
  return (
    <span className={muted ? "opacity-45 grayscale" : undefined}>
      <MediaFrame
        src={getChampionSquareIconUrl(champion)}
        alt={champion}
        size={size}
        shape="square"
        testId="champion-icon"
        fallback={
          <span className="flex flex-col items-center leading-none">
            <Swords className="h-3 w-3 opacity-40" aria-hidden="true" />
          </span>
        }
      />
    </span>
  );
}
