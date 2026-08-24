/**
 * RG3 — the resolution of the Meta Reflex card the viewer just finished.
 *
 * WHY THIS SITS BESIDE THE LIVE CARD AND NOT ON TOP OF IT
 * ──────────────────────────────────────────────────────
 * The obvious design — freeze the two choice cards, light the right one, mark
 * the wrong one, then move on — cannot be built here, and the reason is the
 * server clock rather than a rendering difficulty.
 *
 * A Meta Reflex block gives each card its own window, and card N+1's window
 * OPENS AT THE INSTANT CARD N IS ACCEPTED (`ranked_public.segment_flow
 * .card_schedule`: a slot starts when its predecessor settled). The reveal for
 * card N and the advance to card N+1 therefore arrive on the same snapshot —
 * the client cannot learn one without the other — and any hold on card N to
 * play a reveal would be spent out of card N+1's six seconds, which the player
 * has no way to get back. That is the same argument `MetaReflexSting` makes
 * about the block's first card, and it settles this the same way: the
 * resolution is laid BESIDE live play, never in front of it.
 *
 * So this is a fixed-height strip under the two choices. It resolves the card
 * that just ended — verdict, both labels, both authoritative values, which side
 * was right, and which side the player picked — while the next card is live
 * above it. When the block finishes it is the last card's resolution, sitting
 * in the same place, with nothing competing for attention.
 *
 * NOTHING IS COMPUTED
 * ───────────────────
 * The verdict is `outcome`, decided server-side; the values are the strings the
 * server formatted from the numbers it actually compared; the winning side is
 * the server's `correct_card_id`. This component reads a `ResolvedFeedback`
 * built by the shared adapter, so a Daily reflex card and a Ranked one render
 * from the same model and cannot word the same comparison differently.
 */
import { VerdictLine } from "@/components/question-feedback/VerdictLine";
import { EvidenceLine } from "@/components/question-feedback/EvidenceLine";
import { feedbackFromMetaReflexCard } from "@/lib/question-feedback/adapters";
import type { SettledCardReveal } from "@/lib/ranked-public/contracts";

export function MetaReflexCardResult({
  reveal,
  /** 1-based card number, for the quiet marker. */
  cardNumber,
  className = "",
}: {
  reveal: SettledCardReveal | null;
  cardNumber: number | null;
  className?: string;
}) {
  // Before the first card settles there is nothing to resolve. The block does
  // not reserve the strip's height then: it is the first card of five, the
  // layout is settling anyway, and reserving a permanently empty box for the
  // whole first card is worse than one shift at the start of the block.
  if (!reveal) return null;
  const feedback = feedbackFromMetaReflexCard(reveal);
  const pickedSide =
    reveal.selectedCardId === null
      ? null
      : reveal.selectedCardId.endsWith(":left")
        ? "left"
        : "right";

  return (
    <section
      // Keyed by the caller on the challenge index, so a NEW resolution
      // remounts the strip and replays its entrance rather than mutating in
      // place — the same "this is a beat, not a status line" treatment the
      // round result plate uses.
      aria-label="Previous card result"
      data-testid="mr-card-result"
      data-challenge-index={reveal.challengeIndex}
      data-outcome={reveal.outcome}
      className={`ranked-result-beat rounded-lg border border-white/12 bg-black/25 px-2.5 py-1.5 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        {/* `min-w-0` so the verdict yields before the card marker does: the
            marker is one short token and clipping IT loses which card this
            describes, which is the one thing the row cannot afford to lose.
            No note here — the pick line below already says what was picked,
            and saying it twice in one strip spends the width for nothing. */}
        <VerdictLine verdict={feedback.verdict} className="min-w-0" />
        <span
          aria-hidden
          className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground/70"
        >
          {cardNumber === null ? "" : `CARD ${cardNumber}`}
        </span>
      </div>
      <EvidenceLine evidence={feedback.evidence} className="mt-1" />
      {pickedSide && (
        // Which side the player actually chose, stated in words rather than
        // only as a colour: the two rows above are already coloured by
        // CORRECTNESS, and colouring them a second time by authorship would
        // give one row two meanings.
        <p
          data-testid="mr-card-result-pick"
          data-picked-side={pickedSide}
          className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          You picked {pickedSide === "left" ? "the left" : "the right"} card
        </p>
      )}
    </section>
  );
}
