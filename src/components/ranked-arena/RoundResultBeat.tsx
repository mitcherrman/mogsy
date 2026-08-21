/**
 * THE ROUND-RESOLUTION PRESENTATION — the centre of the top match HUD.
 *
 * The arena's four regions each answer one question: the top strip is match
 * state, the centre is the question, the two rails are the duelists, and the
 * bottom is reserved for the round timeline. A settled round is match state,
 * so it resolves HERE — and, since the bottom result bar is gone from active
 * play, here is the only place it resolves. This is not a status chip beside
 * the real thing; it IS the round-resolution beat.
 *
 * WHAT IT MUST NOT DO, and how each is guaranteed:
 *
 *  * cover the question — it lives inside the strip, in normal flow, above it;
 *  * block input — it has no control and no pointer target;
 *  * change server timing — it reads a settlement, it starts nothing;
 *  * shift layout or grow the header — the plate is a FIXED 2.5rem tall and
 *    `whitespace-nowrap`, so every state occupies the same box inside the
 *    strip's already-reserved `min-h-[3.5rem]`, and every keyframe in
 *    `.ranked-result-beat` is a transform/opacity/shadow, none of which lay
 *    out.
 *
 * FOUR TONES, all from the settlement's own vocabulary — no outcome is
 * invented here, and `resultHeadline` remains the single authority on what a
 * round was CALLED:
 *
 *   correct      — the viewer alone got it right. The rewarding treatment:
 *                  emerald, a warm one-shot glow.
 *   both correct — a traded round. Deliberately NOT the solo-correct
 *                  treatment: brass, a cooler sheen. Nobody out-answered
 *                  anybody, and it should not read as a win.
 *   incorrect    — red, and a short jolt rather than a glow.
 *   timed out    — the same jolt, in the muted register the arena already uses
 *                  for a clock expiry.
 *
 * After its beat the plate simply stays, quietly, as the previous-round
 * summary until the next settlement replaces it. One element does both jobs,
 * so there is no second surface to disagree with it.
 */
import { CheckCircle2, Hourglass, Swords, XCircle } from "lucide-react";
import type {
  PlayerSlot, ResolvedCombatantView, ResolvedRoundView,
} from "@/lib/ranked-core/viewTypes";
import { resultHeadline } from "./RevealBanner";

/**
 * The four presentation tones. Derived from the settlement, never invented:
 * `both-correct` is exactly the case `resultHeadline` already names "Both
 * correct", and the other three are the viewer's own outcome.
 *
 * "Both incorrect" and "Both timed out" deliberately do NOT get their own
 * tone — they are still the viewer being wrong or out of time, and
 * `resultHeadline` already says "Both" in the verdict text. Only the shared
 * SUCCESS needed distinguishing, because that is the one a single tone would
 * have mis-sold as a win.
 */
export type ResultKind = "correct" | "both-correct" | "incorrect" | "timed-out";

export function resultKind(
  viewer: ResolvedCombatantView, opponent: ResolvedCombatantView,
): ResultKind {
  if (viewer.outcome === "timed_out") return "timed-out";
  if (viewer.outcome === "incorrect") return "incorrect";
  return opponent.outcome === "correct" ? "both-correct" : "correct";
}

/**
 * The beat's shared palette. Exported because the SEGMENT beat renders in the
 * same plate and must not invent a second set of tones — a Meta Reflex block
 * and a quiz round are both "the round resolved", and they have to read as one
 * system.
 */
export const RESULT_TONE: Record<ResultKind, {
  /** Verdict type colour. */
  text: string;
  /** Plate border + fill. */
  plate: string;
  Icon: typeof CheckCircle2;
}> = {
  correct: {
    text: "text-emerald-300",
    plate: "border-emerald-400/55 bg-emerald-400/10",
    Icon: CheckCircle2,
  },
  "both-correct": {
    text: "text-[#e8c97a]",
    plate: "border-[#e8c97a]/50 bg-[#e8c97a]/10",
    Icon: Swords,
  },
  incorrect: {
    text: "text-[#e2757b]",
    plate: "border-destructive/55 bg-destructive/10",
    Icon: XCircle,
  },
  "timed-out": {
    text: "text-muted-foreground",
    plate: "border-white/20 bg-white/[0.04]",
    Icon: Hourglass,
  },
};

/**
 * The consequence line: what the round COST, in the arena's loud register.
 *
 * Dealt and taken are kept separate and both shown when both happened — a
 * traded round produces both, and collapsing them to a net number would invent
 * a value the settlement does not contain. A fully absorbed instance is its
 * own fact, and a round that moved nobody's HP says so rather than showing an
 * empty slot (the plate's height is fixed either way).
 */
export function resultConsequence(viewer: ResolvedCombatantView): string {
  const { finalDamageDealt: dealt, finalDamageReceived: taken,
    shieldAbsorbed: absorbed } = viewer;
  // One clause reads as a headline; two must stay labelled or the numbers are
  // ambiguous about which direction they went.
  if (dealt > 0 && taken > 0) return `${dealt} DEALT · ${taken} TAKEN`;
  if (dealt > 0) return `${dealt} DAMAGE`;
  if (taken > 0) return `${taken} DAMAGE TAKEN`;
  if (absorbed > 0) return `${absorbed} ABSORBED`;
  return "NO DAMAGE";
}

/**
 * THE PLATE — the one box every result beat renders in.
 *
 * Quiz rounds and Meta Reflex blocks both resolve here, so the geometry, the
 * chrome, the animation hook and the tone all live in ONE place: a segment
 * result that drifted into its own size or its own palette would stop reading
 * as the same event as the round beside it.
 *
 * The FIXED height and `whitespace-nowrap` are the load-bearing part. They are
 * what keep a resolving round from moving the round title, the clock, or the
 * strip's own reserved `min-h-[3.5rem]`.
 */
export function BeatPlate({
  kind,
  ariaLabel,
  mode,
  primary,
  secondary,
  marker,
  trailing = null,
  dataAttributes = {},
  className = "",
}: {
  kind: ResultKind;
  /** The whole result in one sentence; the visible type is `aria-hidden`. */
  ariaLabel: string;
  /** Which vocabulary produced this beat. Presentation is identical. */
  mode: "round" | "segment";
  /** The loud line. */
  primary: React.ReactNode;
  /** The consequence line, always present so the box never changes shape. */
  secondary: React.ReactNode;
  /** The quiet right-hand slot — which round this describes. */
  marker: string;
  /** Optional control (the segment transcript's disclosure). */
  trailing?: React.ReactNode;
  dataAttributes?: Record<string, string>;
  /**
   * DISPLAY belongs to the caller. The plate is only shown where the strip has
   * room for it, and a `display` utility set here would fight the caller's
   * responsive one rather than compose with it.
   */
  className?: string;
}) {
  return (
    <div
      // `role="status"` WITHOUT `aria-live`: the duelist columns already
      // announce the verdict once during the reveal beat, and announcing it a
      // second time from the header would double up on every round.
      role="status"
      aria-label={ariaLabel}
      data-testid="ranked-last-result"
      data-kind={kind}
      data-mode={mode}
      {...dataAttributes}
      className={`ranked-result-beat h-10 shrink-0 select-none items-center gap-2
        whitespace-nowrap rounded-lg border px-3 ${RESULT_TONE[kind].plate} ${className}`}
    >
      {primary}
      <span
        aria-hidden
        // The round this describes, kept quiet and separated: the strip's own
        // title already says which round is LIVE, and the two must not be
        // mistaken for each other.
        className="ml-1 border-l border-white/15 pl-2 text-[10px] font-semibold tabular-nums text-muted-foreground/70"
      >
        {marker}
      </span>
      {trailing}
      <span aria-hidden className="sr-only">{secondary}</span>
    </div>
  );
}

/**
 * The two-line body every beat shares: a loud verdict over a quiet
 * consequence, beside the tone's icon.
 */
export function BeatBody({
  kind, verdict, consequence, trailing = null,
  verdictTestId = "ranked-last-result-verdict",
}: {
  kind: ResultKind;
  verdict: React.ReactNode;
  consequence: React.ReactNode;
  /**
   * Optional matter that belongs BESIDE the two lines rather than after the
   * round marker — the segment beat's earned-bonus chips. Inside the body so
   * it sits with the result it qualifies, and so the marker stays the last
   * thing on the plate for both modes.
   */
  trailing?: React.ReactNode;
  verdictTestId?: string;
}) {
  const { Icon } = RESULT_TONE[kind];
  return (
    <>
      <Icon aria-hidden className={`h-5 w-5 shrink-0 ${RESULT_TONE[kind].text}`} />
      <span aria-hidden className="flex flex-col justify-center leading-none">
        <span
          data-testid={verdictTestId}
          className={`text-sm font-black uppercase tracking-[0.1em] lg:text-base ${
            RESULT_TONE[kind].text}`}
        >
          {verdict}
        </span>
        <span
          data-testid="ranked-last-result-consequence"
          className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] tabular-nums text-muted-foreground"
        >
          {consequence}
        </span>
      </span>
      {trailing}
    </>
  );
}

export function RoundResultBeat({
  settlement,
  viewerSlot,
  className = "",
}: {
  settlement: ResolvedRoundView;
  viewerSlot: PlayerSlot;
  className?: string;
}) {
  const opponentSlot: PlayerSlot = viewerSlot === "p1" ? "p2" : "p1";
  const viewer = settlement.players[viewerSlot];
  const opponent = settlement.players[opponentSlot];
  // `resultHeadline` stays the one authority on the verdict WORDS, so this and
  // any other result surface can never disagree about what a round was called.
  const { verdict } = resultHeadline(viewer, opponent);
  const kind = resultKind(viewer, opponent);
  const consequence = resultConsequence(viewer);
  return (
    <BeatPlate
      kind={kind}
      mode="round"
      ariaLabel={
        `Round ${settlement.roundNumber} result: ${verdict}, ${consequence.toLowerCase()}`}
      marker={`R${settlement.roundNumber}`}
      dataAttributes={{
        "data-outcome": viewer.outcome,
        "data-round": String(settlement.roundNumber),
      }}
      className={className}
      primary={<BeatBody kind={kind} verdict={verdict} consequence={consequence} />}
      secondary={consequence}
    />
  );
}
