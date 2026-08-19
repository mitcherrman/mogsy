/**
 * RE1 Phase 3B — the first visible Ranked tier presentation.
 *
 * Shows the account's MOGZY competitive standing on the Ranked hub: the Riot
 * ranked emblem, the tier name, the numeric Ranked rating, progress toward
 * the next tier, and the Challenger max state.
 *
 * This is NOT the player's Riot Solo Queue rank, and the copy says so in
 * words rather than relying on the reader to infer it: the eyebrow reads
 * "Mogzy competitive rank" and the title reads "Ranked Gold". The emblem art
 * is Riot's; the standing behind it is entirely Mogzy's.
 *
 * Academy crowns are deliberately not reachable from this component. Academy
 * and Ranked are separate tracks with separate scores and separate art, and
 * `RankCrown` / `resolveCrownArt` are imported nowhere in this file.
 *
 * Presentation only: every threshold, percentage and remaining-points figure
 * is computed by the backend and rendered as given, so this component cannot
 * drift from the server's cutoffs.
 */

import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { rankedTierLabel, resolveRankedEmblemUrl } from "@/lib/progression/rankedArt";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";

export function RankedTierPanel({ progression }: { progression: RankedProgressionView }) {
  const emblemUrl = resolveRankedEmblemUrl(progression.tier, "large");
  const [emblemFailed, setEmblemFailed] = useState(false);
  const tierLabel = rankedTierLabel(progression.tier);
  const atMax = progression.nextTier === null;

  return (
    <section data-testid="ranked-tier-panel" className="ranked-panel p-4">
      <div className="flex items-center gap-4">
        {emblemUrl && !emblemFailed && (
          <img
            data-testid="ranked-tier-emblem"
            src={emblemUrl}
            alt={`${tierLabel} ranked emblem`}
            data-tier={progression.tier}
            className="h-16 w-16 shrink-0 object-contain"
            onError={() => setEmblemFailed(true)}
          />
        )}
        <div className="min-w-0 flex-1">
          {/* Named in words: this is Mogzy standing, not a Riot Solo Queue rank. */}
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Mogzy competitive rank</div>
          <p data-testid="ranked-tier-name" className="text-lg font-semibold">
            Ranked {tierLabel}
          </p>
          <p data-testid="ranked-tier-rating" className="text-sm text-muted-foreground tabular-nums">
            {progression.rating} Ranked rating
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Progress
          data-testid="ranked-tier-progress"
          value={progression.progressPercent}
          aria-label={`Progress toward ${atMax ? tierLabel : rankedTierLabel(progression.nextTier!)}`}
          className="h-1.5"
        />
        {atMax ? (
          <p data-testid="ranked-tier-max" className="mt-1 text-xs text-muted-foreground">
            Challenger — the highest Ranked tier.
          </p>
        ) : (
          <p data-testid="ranked-tier-next" className="mt-1 text-xs text-muted-foreground tabular-nums">
            {progression.ratingToNext} rating to {rankedTierLabel(progression.nextTier!)}
            {progression.nextTierRating !== null && ` (${progression.nextTierRating})`}
          </p>
        )}
      </div>

      {!progression.rated && (
        <p data-testid="ranked-tier-unrated" className="mt-2 text-[11px] text-muted-foreground">
          Play a Ranked match to start moving your rating.
        </p>
      )}
    </section>
  );
}

export default RankedTierPanel;
