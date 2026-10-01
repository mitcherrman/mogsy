// ---------------------------------------------------------------------------
// The league / event mark slot (PPH3, media from DCGI1).
//
// The canonical esports media authority resolves `league` entities keyed by
// upstream's league SLUG ("demacia_cup"), verified against LIVE1's league
// registry, and serves Mogzy's own copy under `assets/esports/leagues/`.
// Upstream's `getLeagues.image` is never loaded by a page.
//
// So the slot looks its league up through the screen's `ProPlayMediaProvider`
// (when that provider was given the slug) and falls back to the league's own
// short name in the gold frame otherwise. An explicit `src` still wins. The
// frame geometry is fixed, so art arriving changes the picture and nothing
// else.
// ---------------------------------------------------------------------------

import { useState } from "react";

import { useEntityMedia } from "@/components/pro-play/media/ProPlayMediaProvider";
import { leagueMonogram } from "@/lib/pro-play/hubSeries";
import { cn } from "@/lib/utils";

const BOX = {
  xs: "h-5 min-w-5 px-1 text-[9px] rounded",
  sm: "h-7 min-w-7 px-1.5 text-[11px] rounded-md",
  lg: "h-14 min-w-14 px-2 text-base rounded-lg",
} as const;

export function EventMark({
  name,
  slug,
  src,
  size = "sm",
  className,
}: {
  name: string | null | undefined;
  slug?: string | null;
  /** A media-authority URL for the league. Never external. */
  src?: string | null;
  size?: keyof typeof BOX;
  className?: string;
}) {
  const authority = useEntityMedia("league", slug);
  const art = src ?? authority.src;
  const [failed, setFailed] = useState(false);
  const showArt = Boolean(art) && !failed;
  const label = name || slug || "League";
  return (
    <span
      data-testid="event-mark"
      data-media-state={showArt ? "art" : "placeholder"}
      title={label}
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-[#c9a84c]/40 bg-[#c9a84c]/[0.07]",
        "font-bold uppercase leading-none tracking-[0.08em] text-[#e3c66f]",
        BOX[size],
        className,
      )}
    >
      {showArt ? (
        <img src={art as string} alt="" className="h-full w-auto object-contain py-1" onError={() => setFailed(true)} />
      ) : (
        leagueMonogram(name, slug)
      )}
    </span>
  );
}
