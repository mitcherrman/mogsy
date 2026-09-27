/**
 * JOURNEY-UI2 — the two sides of a Journey Matchup question, each with ITS OWN
 * ability and rank, straight from the served comparison semantics
 * (`side_contexts`). One side can be rank 1 while the other's value does not
 * move with rank; the old shared-rank sentence could not say that.
 *
 * Presentation only. The reveal keeps the backend's own text, which states
 * both sides' exact values.
 *
 * JOURNEY-PRES-V1 — each tile carries its champion's splash as a darkened,
 * masked underlay (decorative; both champions are named in the prompt), so
 * the confrontation reads as two sides even when the card has no room left
 * for the larger focus plate. The text and the tile's height are unchanged.
 */
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";
import { sideRankText } from "@/features/mastery/interactions/formatComparisonSemantics";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";

export function JourneyMatchupSides({ comparisonSemantics, playerChampion = null }: {
  comparisonSemantics: unknown;
  /** The Journey's player champion: its side is drawn LEFT, as on the board. */
  playerChampion?: string | null;
}) {
  const assets = useMasteryAssets();
  let cs: ReturnType<typeof readComparisonSemantics>;
  try {
    cs = readComparisonSemantics(comparisonSemantics);
  } catch {
    return null;
  }
  const shared = cs.context.abilityRank;
  const side = (i: 0 | 1) => {
    const name = i === 0 ? cs.championADisplay : cs.championBDisplay;
    const ability = i === 0 ? cs.abilityNameA : cs.abilityNameB;
    const rank = cs.sideContexts ? cs.sideContexts[i].abilityRank : (cs.rankIndependent ? null : shared);
    const isPlayer = name === playerChampion || (playerChampion === null && i === 0);
    const splash = assets.championSplashUrl?.(name.toLowerCase(), name) ?? null;
    return (
      <div data-testid={`journey-matchup-side-${i === 0 ? "a" : "b"}`} data-rank={rank ?? "none"}
        data-champion={name} data-side={isPlayer ? "player" : "opponent"}
        className={`journey-matchup-side relative isolate min-w-0 flex-1 overflow-hidden rounded-md border bg-[#07111f] px-2 py-1 text-[11px] leading-4 ${
          isPlayer ? "border-[#d4b35a]/50" : "border-[#7fb2d4]/55 text-right"}`}>
        {splash && (
          <img src={splash} alt="" aria-hidden draggable={false} loading="lazy" decoding="async"
            data-testid="journey-matchup-splash" className="journey-matchup-side__splash"
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
        <span className="font-black uppercase tracking-[0.06em] text-white">{name}</span>
        <span className="text-white/80"> · {ability || cs.subjectRef}{cs.subjectRef ? ` (${cs.subjectRef})` : ""}</span>
        <span className="font-bold uppercase tracking-[0.08em] text-[#e8c97a]"> · {sideRankText(rank)}</span>
      </div>
    );
  };
  // The comparison's A/B order is the backend's; the board's is subject left.
  // Follow the board, so a side never changes places between the two.
  const swap = playerChampion !== null && cs.championBDisplay === playerChampion;
  return (
    <div data-testid="journey-matchup-sides" className="flex items-stretch gap-2" aria-label="Both sides of the comparison">
      {swap ? side(1) : side(0)}
      <span aria-hidden className="self-center text-[11px] font-black tracking-[0.2em] text-[#e8c97a]/80">VS</span>
      {swap ? side(0) : side(1)}
    </div>
  );
}
