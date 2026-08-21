/**
 * A SETTLED MULTI-CHALLENGE BLOCK, in the top match HUD.
 *
 * Meta Reflex (and Item Cost Duel before it) settles FIVE cards at once, and
 * its result used to land in a full-width bar at the bottom of the arena. That
 * region is reserved for the round timeline and must stay continuously
 * available, so the block now resolves in the same plate an ordinary round
 * does — same geometry, same palette, same entrance — and the bottom of the
 * arena holds no result surface in any active state.
 *
 * WHY IT NEEDED ITS OWN VOCABULARY RATHER THAN JUST REUSING `RoundResultBeat`.
 * A block's outcome is not one answer: `ResolvedRoundView` has a single
 * `outcome` and a damage figure, and it cannot say "you got 5 of 5 and they
 * got 3". Those counts are the whole point of a block, and they exist only on
 * the segment reveal (`SegmentRevealPlayer.correct` / `challengeCount`). So the
 * vocabulary is extended exactly far enough to carry them, and no further.
 *
 * WHAT IT SHOWS, every field settlement pass-through:
 *
 *   line 1   the module ("Meta Reflex") and the block's own result WORD
 *            (Win / Loss / Draw / Timeout) — never colour alone;
 *   line 2   `YOU 5/5 · OPP 3/5 · 7 DMG` — the scoreline, which is what a
 *            player reads a block by, plus the damage it dealt;
 *   marker   the round the block settled on, exactly as a quiz round shows.
 *
 * THE MOMENTUM BONUSES. Meta Reflex pays 1 damage a correct card, +1 for a
 * perfect block, and +1 more if that perfect player finished strictly sooner
 * than the opponent — speed is a premium LAYERED ON accuracy and is worth
 * nothing without it. Both are computed server-side from frozen inputs
 * (`item_cost_duel.block_damage`) and both are stated in the settlement as
 * `perfect` and `speed_bonus`, so they are read, never inferred. In
 * particular the speed premium is NEVER derived from `perChallengeMs`: the
 * server compares its own block durations, and a client re-deciding that from
 * display timings could contradict the damage it is standing next to.
 *
 * They are shown as two compact chips, and only when EARNED — a block that
 * earned neither says nothing, rather than showing two empty slots. The chips
 * are the one part of the plate that is `lg`-only: they are the widest thing
 * it can carry, and the strip's fixed height matters more than they do.
 *
 * The block's RESULT maps onto the four existing beat tones rather than adding
 * a fifth set: a win is the rewarding treatment, a loss the negative one, a
 * draw the traded-round one, and a timeout the clock-expiry one. A block and a
 * round must read as the same kind of event.
 */
import { ChevronDown, Gauge, Star } from "lucide-react";
import type {
  SegmentResult, SegmentSettlementView,
} from "@/lib/ranked-public/contracts";
import { segmentTitle } from "./SegmentTranscript";
import { BeatBody, BeatPlate, type ResultKind } from "./RoundResultBeat";

/**
 * Block result → beat tone. A deliberate mapping onto the EXISTING four, not a
 * new palette: `draw` takes the traded-round treatment for the same reason
 * "both correct" does — nobody out-answered anybody.
 */
const KIND_FOR_RESULT: Record<SegmentResult, ResultKind> = {
  win: "correct",
  loss: "incorrect",
  draw: "both-correct",
  timeout: "timed-out",
};

const RESULT_WORD: Record<SegmentResult, string> = {
  win: "Win", loss: "Loss", draw: "Draw", timeout: "Timeout",
};

/**
 * The scoreline: both players' correct counts out of the block's own challenge
 * count, plus the damage the viewer dealt.
 *
 * The opponent's clause is dropped — never zeroed — when the settlement
 * carries no opponent entry, which is the only case where that number would
 * have to be invented. Damage is likewise omitted rather than shown as
 * "0 DMG" when the block dealt none.
 */
export function segmentScoreline(
  settlement: SegmentSettlementView,
  viewerUserId: string,
  opponentUserId: string | null,
): string {
  const { reveal } = settlement;
  const total = reveal.challengeCount;
  const you = reveal.players[viewerUserId];
  const them = opponentUserId ? reveal.players[opponentUserId] : undefined;
  const parts = [`YOU ${you?.correct ?? 0}/${total}`];
  if (them) parts.push(`OPP ${them.correct}/${total}`);
  const damage = settlement.damageByPlayerId[viewerUserId] ?? 0;
  if (damage > 0) parts.push(`${damage} DMG`);
  return parts.join(" · ");
}

/**
 * The earned bonuses, as two small chips.
 *
 * Rendered ONLY when earned, so the common block adds nothing to the plate,
 * and stacked rather than inlined so they fit the plate's fixed 2.5rem
 * without a second row. Icon AND word, like every other state in this system.
 *
 * The magnitudes are deliberately absent. `perfect` is a boolean in the
 * settlement and the damage it is worth is a server constant; printing "+1"
 * beside it would be this component asserting a game rule it cannot see. The
 * total the bonuses produced is already on the scoreline.
 */
function BonusChips({ perfect, speedBonus }:
{ perfect: boolean; speedBonus: number }) {
  if (!perfect && speedBonus <= 0) return null;
  return (
    <span aria-hidden data-testid="segment-bonus-chips"
      className="hidden flex-col justify-center gap-0.5 lg:flex">
      {perfect && (
        <span data-testid="segment-bonus-perfect"
          className="inline-flex items-center gap-0.5 rounded bg-emerald-400/15 px-1
            text-[9px] font-black uppercase tracking-[0.1em] text-emerald-300">
          <Star aria-hidden className="h-2.5 w-2.5 shrink-0" />Perfect
        </span>
      )}
      {speedBonus > 0 && (
        <span data-testid="segment-bonus-speed"
          className="inline-flex items-center gap-0.5 rounded bg-[#e8c97a]/15 px-1
            text-[9px] font-black uppercase tracking-[0.1em] text-[#e8c97a]">
          <Gauge aria-hidden className="h-2.5 w-2.5 shrink-0" />Speed
        </span>
      )}
    </span>
  );
}

export function SegmentResultBeat({
  settlement,
  viewerUserId,
  opponentUserId,
  roundNumber,
  detailsOpen,
  onToggleDetails,
  className = "",
}: {
  settlement: SegmentSettlementView;
  viewerUserId: string;
  opponentUserId: string | null;
  /** The round the block settled on; null before one is known. */
  roundNumber: number | null;
  /**
   * The card-by-card transcript's disclosure state. OWNED BY THE ARENA, not
   * here, because the transcript itself cannot render here: the header is a
   * `.ranked-panel`, which is `overflow: hidden`, so anything hung off this
   * plate would be clipped by its own strip. The arena renders it against the
   * shell instead; this only offers the control and reports the intent.
   */
  detailsOpen: boolean;
  onToggleDetails: (open: boolean) => void;
  className?: string;
}) {
  const title = segmentTitle(settlement.reveal);
  const you = settlement.reveal.players[viewerUserId];
  const result = you?.segmentResult ?? null;
  // A settlement with no result for the viewer is a real, if rare, shape (an
  // older payload). It resolves to the neutral traded-round tone and the word
  // "Resolved" — never a guessed win or loss.
  const kind = result ? KIND_FOR_RESULT[result] : "both-correct";
  const word = result ? RESULT_WORD[result] : "Resolved";
  const scoreline = segmentScoreline(settlement, viewerUserId, opponentUserId);
  return (
    <BeatPlate
      kind={kind}
      mode="segment"
      ariaLabel={`${title} ${word.toLowerCase()}: ${scoreline.toLowerCase()}${
        you?.perfect ? ", perfect block" : ""}${
        (you?.speedBonus ?? 0) > 0 ? ", speed bonus" : ""}`}
      marker={roundNumber === null ? "—" : `R${roundNumber}`}
      dataAttributes={{
        "data-segment-result": result ?? "unknown",
        "data-perfect": you?.perfect === true ? "true" : "false",
        "data-speed-bonus": String(you?.speedBonus ?? 0),
      }}
      className={className}
      primary={
        <BeatBody
          kind={kind}
          verdict={
            <>
              {/* The module name is context the player already has — they have
                  just played five of its cards — so it is the first thing to
                  give up where the strip is narrow. The result word never is. */}
              <span className="hidden text-muted-foreground lg:inline">{title}</span>
              <span aria-hidden className="hidden text-muted-foreground/50 lg:inline"> · </span>
              <span>{word}</span>
            </>
          }
          consequence={scoreline}
          trailing={<BonusChips perfect={you?.perfect === true}
            speedBonus={you?.speedBonus ?? 0} />}
        />
      }
      secondary={scoreline}
      trailing={
        <button
          type="button"
          onClick={() => onToggleDetails(!detailsOpen)}
          aria-expanded={detailsOpen}
          data-testid="segment-details-toggle"
          className="-mr-1 ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center
            rounded text-muted-foreground hover:text-foreground"
        >
          <span className="sr-only">
            {detailsOpen ? "Hide" : "Show"} {title} card-by-card breakdown
          </span>
          <ChevronDown aria-hidden
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
              detailsOpen ? "rotate-180" : ""}`} />
        </button>
      }
    />
  );
}
