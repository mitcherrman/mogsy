// ---------------------------------------------------------------------------
// The league / event mark slot (PPH3).
//
// A FALLBACK BY DESIGN, FOR NOW. The canonical esports media authority knows
// two entity types, `team` and `player`; it has no league or tournament
// entity. Upstream's `getLeagues` does carry an `image`, but that is an
// external lolesports URL, and the media contract is that no page render ever
// reaches an external host. So this slot draws the league's own short name in
// a gold frame, and does not look anything up.
//
// The follow-up is an entity type in the media authority (`league`, ingested
// and approved like crests). When it exists, the caller passes the resolved
// `src` and the picture changes; the frame geometry is fixed so nothing else
// does.
// ---------------------------------------------------------------------------

import { useState } from "react";

import { leagueMonogram } from "@/lib/pro-play/hubSeries";
import { cn } from "@/lib/utils";

const BOX = {
  xs: "h-5 min-w-5 px-1 text-[9px] rounded",
  sm: "h-7 min-w-7 px-1.5 text-[11px] rounded-md",
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
  /** A media-authority URL for the league, once one exists. Never external. */
  src?: string | null;
  size?: keyof typeof BOX;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showArt = Boolean(src) && !failed;
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
        <img src={src as string} alt="" className="h-full w-auto object-contain py-1" onError={() => setFailed(true)} />
      ) : (
        leagueMonogram(name, slug)
      )}
    </span>
  );
}
