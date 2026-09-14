/**
 * THE PER-CARD RESULT BEAT — points-native, in the arena's ONE result slot.
 *
 * WHY THIS MOVED. POINT1 first rendered a card's result as a `BeatPlate` at
 * the top of the MODULE's own viewport, on the reasoning that the header's
 * result slot was already owned by the module-level `SegmentResultBeat`. That
 * produced two textual result surfaces in the same frame — a CORRECT /
 * INCORRECT strip inside the question area, and the header plate above it —
 * and the header one was, for the whole of a live block, the STALE PREVIOUS
 * ROUND rendered through the legacy damage branch ("2 DEALT · 3 TAKEN").
 *
 * There is exactly one per-card textual result surface and it is this, in the
 * header, because the two beats never contend in practice: a card resolves
 * while its block is still running, and the block's own settlement does not
 * exist until every card has. The arena gives the block's beat precedence the
 * moment it arrives, so the last card's result is replaced by the scoreline
 * that describes it rather than argued with.
 *
 * POINTS, NEVER DAMAGE. This plate has no access to a combatant view and
 * therefore no damage clause to fall back to — the vocabulary is structurally
 * unreachable here, not merely unused.
 *
 * "+1 POINT" / "+0 POINTS" IS A PROJECTION, NOT A SECOND SCORER. Meta Reflex
 * pays exactly one point per correct card (`item_cost_duel.block_damage` is
 * `correct_count`, plus module-level bonuses) and the backend publishes no
 * per-card award to read, so the only honest thing a card can state is that
 * rule applied to the server's own verdict. Nothing here adds, compares or
 * accumulates. The perfect / first premium is a property of the BLOCK and is
 * stated only by the block's beat, because it belongs to no single card.
 *
 * There is deliberately no opponent clause. A Meta Reflex card is not
 * zero-sum — both players can be correct on the same card — so "OPPONENT +1
 * POINT" would invent a transfer the rules do not contain.
 */
import type { ArenaCardBeat } from "@/lib/ranked-core/arenaView";
import { BeatBody, BeatPlate, type ResultKind } from "./RoundResultBeat";

/**
 * The card's outcome → the arena's existing four tones. `unanswered` shares
 * `timeout`'s register for the same reason the round plate does: a card the
 * player never reached is a clock expiry, not a wrong answer.
 */
const KIND_FOR_OUTCOME: Record<ArenaCardBeat["outcome"], ResultKind> = {
  correct: "correct",
  incorrect: "incorrect",
  timeout: "timed-out",
  unanswered: "timed-out",
};

/** The loud line. The server's verdict word, never a comparison made here. */
const VERDICT: Record<ArenaCardBeat["outcome"], string> = {
  correct: "CORRECT",
  incorrect: "INCORRECT",
  timeout: "TIMED OUT",
  unanswered: "TIMED OUT",
};

/** One point a correct card, nothing otherwise. The module's own rule. */
export function cardAward(outcome: ArenaCardBeat["outcome"]): string {
  return outcome === "correct" ? "+1 POINT" : "+0 POINTS";
}

export function CardResultBeat({ beat, className = "" }: {
  beat: ArenaCardBeat;
  className?: string;
}) {
  const kind = KIND_FOR_OUTCOME[beat.outcome];
  const verdict = VERDICT[beat.outcome];
  const award = cardAward(beat.outcome);
  return (
    <BeatPlate
      kind={kind}
      mode="round"
      ariaLabel={`Card ${beat.cardNumber} result: ${verdict.toLowerCase()}, ${
        beat.outcome === "correct" ? "plus one point" : "no points"}`}
      marker={`C${beat.cardNumber}`}
      dataAttributes={{
        "data-testid": "ranked-card-beat",
        "data-outcome": beat.outcome,
        "data-challenge-index": String(beat.challengeIndex),
      }}
      className={className}
      primary={<BeatBody kind={kind} verdict={verdict} consequence={award}
        verdictTestId="ranked-card-beat-verdict" />}
      secondary={award}
    />
  );
}
