/**
 * Daily Challenge RULES → canonical arena data (DC1 Phase 5, ARENA1 Step 5).
 *
 * Pure functions from the authoritative run projection to display data. Nothing
 * here decides anything: not correctness, not score, not whether a window is
 * open, not whether a card resolved. Every value is READ from what the server
 * said, which is what keeps the arena from becoming a second state machine
 * that can disagree with the backend it renders.
 *
 * The one thing this module DOES own is vocabulary — turning a card's state
 * into the beat the player sees — and that vocabulary is derived from server
 * facts (`score_outcome`, `resolved`, `phase`) rather than remembered locally.
 *
 * WHAT ARENA1 STEP 5 CHANGED HERE
 * ───────────────────────────────
 * Three projections left. `projectQuestion` and `projectOptionMedia` produced
 * a bespoke `QuestionView` with `media: null` on every option — the Daily's
 * whole art layer was being thrown away one line before it reached a renderer
 * that could have drawn it. `projectTimeline` produced a bespoke node list for
 * a bespoke strip.
 *
 * All three are replaced by ONE projection into the shape the production arena
 * already reads: `publicRoundFromCard`. The canonical registry resolves the
 * renderer from it, the canonical adapters project the question from it, and
 * the canonical asset resolver draws the art — so the Daily inherits item and
 * champion art, ability icons, scenario bands, option media, image fallbacks
 * and media sizing without owning a line of any of it.
 */

import { LEGACY_SEGMENT } from "@/lib/ranked-public/contracts";
import { feedbackFromDailyCard } from "@/lib/question-feedback/adapters";
import { NO_FEEDBACK, type ResolvedFeedback } from "@/lib/question-feedback/model";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import { answerOptionId } from "@/lib/ranked-core/adapters/adaptToViews";
import type {
  OptionMediaView,
  ResultKind,
  RoundHistoryEntry,
  TimelineSegmentKind,
  TimerView,
} from "@/lib/ranked-core/viewTypes";
import type {
  DcAnswerEvent,
  DcCard,
  DcResolvedCard,
  DcRun,
  DcStructureEntry,
  DcUnresolvedCard,
} from "@/lib/daily-challenge/contracts";
import { currentCard, lastResolvedCard } from "@/lib/daily-challenge/contracts";

/** The one seat in a solo run. Stable, because the arena keys rails on it. */
export const DAILY_PLAYER_ID = "daily-player";
const DAILY_MATCH_ID = "daily-challenge";

// ── the surface a card is showing ──────────────────────────────────────────

/**
 * What the CENTRE is doing right now.
 *
 * `reflex_ready` is the state that exists only because activation is explicit:
 * a Meta Reflex card the player has reached and NOT yet started. Rendering it
 * is what makes the six-second window a decision rather than a surprise.
 */
export type DcCardPhase =
  | "open"            // standard card, scored attempt still available
  | "reflex_ready"    // reflex card awaiting explicit activation
  | "reflex_timed"    // reflex card with a live server window
  | "learning"        // score settled, still unsolved — retry until correct
  | "resolved";       // solved; the answer may now be shown

export function cardPhase(card: DcCard | null): DcCardPhase | null {
  if (!card) return null;
  if (card.resolved) return "resolved";
  if (card.scoreLocked) return "learning";
  if (card.requiresActivation) {
    return card.activated && card.timer ? "reflex_timed" : "reflex_ready";
  }
  return "open";
}

/** Whether the player may submit an answer right now. */
export function canAnswer(phase: DcCardPhase | null): boolean {
  return phase === "open" || phase === "reflex_timed" || phase === "learning";
}

// ── the card, in the shape the production arena reads ──────────────────────

/**
 * One option's canonical media, or null.
 *
 * The backend freezes an entity's art WITH the card (see `snapshot.py`), so
 * `media` is an asset PATH and `entity_id` is the canonical id — exactly the
 * two things `OptionMediaView` carries. `side` ("left"/"right" on a Meta Reflex
 * card) is not an entity TYPE and is deliberately not passed off as one: the
 * type is only ever used for debug/tests, and claiming a wrong one would be a
 * lie in a field the resolver does not need.
 *
 * `icon` is a backend-relative path, which is what `resolveQuizAssetUrl`
 * expects — the same resolver every other League asset in the app goes through.
 */
function optionMediaFromCard(card: DcCard): OptionMediaView[] | null {
  if (!card.options.some((o) => o.media)) return null;
  return card.options.map((o) => (o.media
    ? {
      type: "",
      name: o.label ?? "",
      icon: o.media,
      ...(o.entityId !== null ? { id: o.entityId } : {}),
    }
    : null)) as OptionMediaView[];
}

/**
 * THE CARD, AS A PUBLIC ROUND.
 *
 * The Daily's own transport is not the Ranked one and never will be — this is
 * not an attempt to make it so. It is the smallest honest statement of "here
 * is a question and its options" in the shape the canonical registry, the
 * canonical question adapter and the canonical scenario adapter already read,
 * so that the Daily reaches the SAME renderer Ranked does rather than a copy
 * of it.
 *
 * `presentation` is the load-bearing line. The backend stores a quiz card's
 * `media` as the question's own presentation metadata (`media=record.presentation`
 * in `snapshot.py`) — the same Quiz/Broadcast-compatible blob Ranked transports
 * — so passing it through is what gives the Daily the premium scenario band,
 * the family band, champion splashes and item art. The previous projection
 * dropped it on the floor and the mode rendered plain text prompts for its
 * whole life.
 *
 * Everything below `question` is structural: the arena needs a round object,
 * and a solo run has exactly one participant, no active PvP round, no segment
 * phase and no ability layer. None of it is invented — it states absence.
 */
export function publicRoundFromCard(
  card: DcCard | null, run: DcRun | null,
): PublicRoundView {
  return {
    schemaVersion: "daily-challenge.local.v1",
    serverTime: run?.serverNow ?? "",
    matchId: DAILY_MATCH_ID,
    matchStatus: run?.status ?? "active",
    matchOver: run?.status === "completed",
    winnerId: null,
    completionReason: null,
    completedRounds: run?.resolvedCount ?? 0,
    players: [],
    activeRound: null,
    nextRoundDurationSeconds: 0,
    question: card
      ? {
        // The SEQUENCE identifies the question to the arena, and that matters:
        // the answer grid keys its entrance animation on the question id, so a
        // per-card id is what makes each card's tablets play in once.
        questionId: `daily-${card.sequence}`,
        prompt: card.prompt,
        // A Meta Reflex recognition side has no label: its prompt names the
        // target, so a label would be the answer. The art carries the option,
        // and an empty string is the honest absence of text.
        options: card.options.map((o) => o.label ?? ""),
        category: card.category,
        presentation: card.media,
        optionMedia: optionMediaFromCard(card),
      }
      : null,
    // A quiz segment: one challenge, the shell owns the submission, and the
    // canonical registry resolves `quizModule` from it. Named through the
    // production constant rather than written out, so a change to the default
    // segment reaches the Daily too.
    segment: LEGACY_SEGMENT,
    segmentState: null,
    progressionPendingPlayers: [],
    // No level layer, no XP meter, no ability tray, no level-2 choice.
    progressionEnabled: false,
    presence: null,
    playtest: null,
  };
}

/**
 * ONE CARD, as RG3's resolved-feedback model — the single channel the shared
 * question surface reads its verdict, its struck options and its disclosure
 * gate from.
 *
 * Nothing is decided here. `feedbackFromDailyCard` is `main`'s own adapter and
 * it was written against the DC2 WIRE shape, anticipating exactly this caller;
 * all this does is hand the parsed card back in the shape that adapter reads.
 * The mapping is 1:1 and the field names are the only difference.
 *
 * Why go back through the adapter instead of building a `ResolvedFeedback`
 * directly: the disclosure rules live inside it — `disclosureAllowed` is the
 * backend's `resolved` and never its `score_locked`, a resolved card's answer
 * is published and an unresolved one's is not, and the result is `sealed()`.
 * A second construction site would be a second place those rules could drift.
 */
export function feedbackForCard(card: DcCard | null): ResolvedFeedback {
  if (!card) return NO_FEEDBACK;
  const resolved = card.resolved === true;
  return feedbackFromDailyCard({
    resolved,
    score_locked: card.scoreLocked,
    score_outcome: card.scoreOutcome,
    eliminated: card.eliminated,
    options: card.options.map((o) => ({ index: o.index })),
    ...(resolved
      ? {
        correct_index: (card as DcResolvedCard).correctIndex,
        explanation: (card as DcResolvedCard).explanation,
        attempts: (card as DcResolvedCard).attempts.map((a) => ({
          selected_index: a.selectedIndex, is_correct: a.isCorrect,
        })),
        // The Meta Reflex comparison the server published, verbatim. The
        // adapter reads the named display fields off it and nothing else.
        reveal: (card as DcResolvedCard).reveal as Parameters<
          typeof feedbackFromDailyCard>[0]["reveal"],
      }
      : {}),
  });
}

/** The viewer's selection: a Daily card has none — one click IS the answer. */
export const DAILY_NO_SELECTION = null;

// ── timer ──────────────────────────────────────────────────────────────────

/**
 * The scored window as a `TimerView`, or null.
 *
 * `durationSeconds` is the largest remaining value observed for THIS window,
 * carried by the caller. On a fresh activation that is the whole window; after
 * a refresh mid-countdown the client genuinely does not know how long the
 * window originally was — the backend publishes a deadline, not a duration —
 * so the meter starts from what is actually left. That is honest, where
 * assuming six seconds would draw a bar that does not match the number beside
 * it if the window is ever retuned.
 *
 * The countdown is DISPLAY ONLY. Expiry is decided by the server, which locks
 * the card at zero on the next read or write; a client whose clock disagrees
 * loses nothing but a smooth animation.
 */
export function projectTimer(
  card: DcCard | null, observedMaxMs: number | null, nowMs: number, skewMs: number,
): TimerView | null {
  if (!card || !card.timer) return null;
  const endsAtMs = Date.parse(card.timer.endsAt);
  if (!Number.isFinite(endsAtMs)) return null;
  const remainingMs = Math.max(0, endsAtMs - (nowMs + skewMs));
  const durationMs = Math.max(observedMaxMs ?? 0, remainingMs, 1);
  return {
    durationSeconds: Math.ceil(durationMs / 1000),
    remainingSeconds: Math.ceil(remainingMs / 1000),
    paused: false,
    urgent: remainingMs <= 2000,
  };
}

/** Server clock minus this device's, from a projection's own timestamp. */
export function clockSkewMs(serverNowIso: string, deviceNowMs: number): number {
  const serverMs = Date.parse(serverNowIso);
  return Number.isFinite(serverMs) ? serverMs - deviceNowMs : 0;
}

// ── result beats ───────────────────────────────────────────────────────────

/**
 * WHAT JUST HAPPENED, in the vocabulary the arena animates from.
 *
 * `first_miss` and `learning_miss` are deliberately different beats for the
 * same wrong answer, because they cost different things: the first spends the
 * card's one scored attempt, and every one after it spends nothing at all. A
 * single "wrong" beat replayed at full volume would punish a learner four
 * times for a mistake they made once.
 */
export type DcBeatKind =
  | "first_correct"
  | "first_miss"
  | "learning_miss"
  | "learned"
  | "reflex_timeout";

export interface DcBeat {
  kind: DcBeatKind;
  /** Whether this beat advanced the challenge. Only first attempts do. */
  scored: boolean;
  scoreDelta: number;
  /** The card this beat belongs to, so a stale beat can be discarded. */
  sequence: number;
  reflex: boolean;
}

export function projectBeat(event: DcAnswerEvent, card: DcCard): DcBeat {
  const reflex = card.kind === "meta_reflex";
  let kind: DcBeatKind;
  if (event.phase === "scored") {
    kind = event.correct ? "first_correct" : "first_miss";
  } else {
    kind = event.correct ? "learned" : "learning_miss";
  }
  return {
    kind,
    scored: event.phase === "scored" && event.correct,
    scoreDelta: event.scoreDelta,
    sequence: card.sequence,
    reflex,
  };
}

/**
 * A beat for a window that lapsed while nobody was looking.
 *
 * Not an answer event — a timeout is the ABSENCE of one, and the backend
 * records it on the card with no attempt row. It surfaces on the next read, so
 * the arena has to notice it from card state rather than from a submission.
 */
export function timeoutBeat(card: DcCard): DcBeat | null {
  if (card.resolved || card.scoreOutcome !== "timeout") return null;
  return {
    kind: "reflex_timeout",
    scored: false,
    scoreDelta: 0,
    sequence: card.sequence,
    reflex: card.kind === "meta_reflex",
  };
}

/**
 * THE STATUS LINE, for each beat.
 *
 * These are the arena's ONE reserved status line — the same line Ranked writes
 * "Answer locked — waiting for opponent…" into. The Daily's beats are longer
 * lived than Ranked's because its rounds are, so the line is where they belong:
 * it is reserved-height, it is announced politely, and it moves nothing.
 */
export const BEAT_COPY: Record<DcBeatKind, { title: string; detail: string }> = {
  first_correct: { title: "Solved first try", detail: "Scored." },
  // Says what it COST and what to do next, in that order, and never that the
  // player failed: the card is still winnable, just not for points.
  first_miss: { title: "Missed for score", detail: "Keep solving — it still counts as learned." },
  learning_miss: { title: "Not that one", detail: "Try another." },
  learned: { title: "Learned", detail: "Solved after the scored attempt." },
  reflex_timeout: { title: "Time", detail: "The window closed — solve it untimed." },
};

/** One line for the arena's status slot. */
export function beatStatusText(beat: DcBeat): string {
  const copy = BEAT_COPY[beat.kind];
  const delta = beat.scored && beat.scoreDelta > 0 ? ` +${beat.scoreDelta}` : "";
  return `${copy.title} — ${copy.detail}${delta}`;
}

// ── the challenge (RIGHT column) ───────────────────────────────────────────

export interface DcChallengeView {
  /** Cards the player has finished, of the day's total. Completion is CARDS. */
  resolved: number;
  total: number;
  remaining: number;
  /** Score as basis points of the frozen maximum — the "damage" meter. */
  progressBp: number;
  score: number;
  maxScore: number;
  /** What is still winnable: max minus what is already lost, in points. */
  standingBp: number;
  theme: string | null;
  challengeDate: string;
  complete: boolean;
}

/**
 * The Daily as a thing to get through, never as a thing that answers back.
 *
 * TWO measures, deliberately, because they mean different things and one
 * cannot stand for the other:
 *
 * `resolved / total` is PROGRESS and is the only thing that ends the run. It
 * rises on every solved card, including one solved after a miss.
 *
 * `progressBp` is SCORE, which moves only on first attempts. It is the meter
 * that reads as damage — and it can finish the day well short of full without
 * anything being wrong, which is exactly the point of a grade.
 *
 * Nothing here can terminate the run. The finite card plan does that, and a
 * score meter that reached 100% early would still leave cards to play.
 */
export function projectChallenge(run: DcRun, theme: string | null): DcChallengeView {
  const total = run.cardCount;
  const resolved = run.resolvedCount;
  const maxScore = Math.max(0, run.maxScore);
  const progressBp = maxScore > 0
    ? Math.min(10_000, Math.round((run.score * 10_000) / maxScore))
    : 0;
  return {
    resolved,
    total,
    remaining: Math.max(0, total - resolved),
    progressBp,
    score: run.score,
    maxScore,
    standingBp: Math.max(0, 10_000 - progressBp),
    theme,
    challengeDate: run.challengeDate,
    complete: run.status === "completed",
  };
}

// ── the player (LEFT column) ───────────────────────────────────────────────

export interface DcPlayerView {
  score: number;
  maxScore: number;
  firstAttemptCorrect: number;
  firstAttemptMissed: number;
  settled: number;
  accuracyBp: number | null;
  reflexCorrect: number;
  reflexTotal: number;
  timeouts: number;
}

export function projectPlayer(run: DcRun): DcPlayerView {
  const s = run.summary;
  return {
    score: run.score,
    maxScore: run.maxScore,
    firstAttemptCorrect: s.firstAttemptCorrectCount,
    firstAttemptMissed: s.firstAttemptMissCount,
    settled: s.firstAttemptCorrectCount + s.firstAttemptMissCount,
    accuracyBp: s.firstAttemptAccuracyBp,
    reflexCorrect: s.reflexFirstAttemptCorrect,
    reflexTotal: s.reflexCardCount,
    timeouts: s.timeoutCount,
  };
}

// ── what a settled card was ────────────────────────────────────────────────

/**
 * ONE CARD'S VERDICT, in the arena's four-tone vocabulary.
 *
 * The three-way distinction is the mode's whole shape, and it survives because
 * the arena already has three of the tones it needs:
 *
 *   first try        → `correct`
 *   window lapsed    → `timed-out`
 *   solved afterwards→ `incorrect`
 *
 * The last one is the only mapping worth arguing about, and it is right: under
 * retry-until-correct EVERY card ends solved, so "did it end solved" says
 * nothing at all. What the mark reports is the FIRST ATTEMPT, which is the only
 * attempt that scored — and the player's first attempt on a learned card was
 * indeed incorrect. Reading a learned card as a win is the one thing the strip
 * must not do.
 *
 * `both-correct` is unreachable here, and correctly so: it means "your opponent
 * also got it right", and there is no opponent.
 */
export function cardResultKind(card: DcResolvedCard): ResultKind {
  if (card.firstAttemptCorrect) return "correct";
  return card.scoreOutcome === "timeout" ? "timed-out" : "incorrect";
}

/** Every settled card's verdict, by sequence — the canonical timeline's input. */
export function dailyOutcomes(run: DcRun): Map<number, ResultKind> {
  const out = new Map<number, ResultKind>();
  for (const card of run.cards) {
    if (card.resolved === true) out.set(card.sequence, cardResultKind(card));
  }
  return out;
}

/**
 * The day's shape, per position, as the timeline's SEGMENT identity.
 *
 * From `GET /today`'s frozen structure, which is a fact about TODAY's challenge
 * version — so a run resumed across a regeneration plays an older version whose
 * shape that structure does not describe. When the versions disagree the kinds
 * are dropped rather than guessed, and every node renders as "not observed",
 * which is exactly what the canonical strip's neutral token means.
 */
export function dailySegmentKinds(
  structure: DcStructureEntry[] | null,
  structureVersion: number | null,
  runVersion: number | null,
): Map<number, TimelineSegmentKind> {
  const out = new Map<number, TimelineSegmentKind>();
  if (!structure || structureVersion === null || structureVersion !== runVersion) return out;
  for (const entry of structure) {
    out.set(entry.sequence, entry.kind === "meta_reflex" ? "meta-reflex" : "standard");
  }
  return out;
}

/**
 * THE RUN AS A LEDGER — one row per settled card, oldest first.
 *
 * The same `RoundHistoryEntry` rows Ranked's duelist column reads, because the
 * questions they answer are the same ones: what happened on that card, and what
 * it did to the meter above. Nothing is invented to fill a combat field —
 * `taken` and `absorbed` are zero because a solo run has nothing that damages
 * the player, and `hpBefore`/`hpAfter` are the running score, which is what the
 * meter is showing.
 *
 * `dealt` is the card's AWARDED score, straight off the backend. A learned card
 * awarded nothing and shows nothing, which is the honest reading: it cost the
 * player the card's points.
 */
export function roundHistoryFromRun(run: DcRun): RoundHistoryEntry[] {
  const settled = run.cards
    .filter((c): c is DcResolvedCard => c.resolved === true)
    .sort((a, b) => a.sequence - b.sequence);
  let running = 0;
  return settled.map((card) => {
    const before = running;
    running += card.awardedScore;
    return {
      roundNumber: card.sequence,
      outcome: card.firstAttemptCorrect ? "correct" as const
        : card.scoreOutcome === "timeout" ? "timed_out" as const : "incorrect" as const,
      dealt: card.awardedScore,
      taken: 0,
      absorbed: 0,
      hpBefore: before,
      hpAfter: running,
      timeExpired: card.scoreOutcome === "timeout",
    };
  });
}

// ── reveal ─────────────────────────────────────────────────────────────────

export interface DcRevealView {
  sequence: number;
  correctIndex: number;
  correctLabel: string | null;
  explanation: string | null;
  firstAttemptCorrect: boolean;
  timedOut: boolean;
  awardedScore: number;
  attemptCount: number;
}

/**
 * The answer, and ONLY from a resolved card.
 *
 * `DcResolvedCard` is the only type that carries `correctIndex`, so a caller
 * cannot reach this with an unresolved one. That is the client half of the
 * disclosure gate — the backend simply never sends the field, and the parser
 * never invents it.
 */
export function projectReveal(card: DcResolvedCard): DcRevealView {
  return {
    sequence: card.sequence,
    correctIndex: card.correctIndex,
    correctLabel: card.options.find((o) => o.index === card.correctIndex)?.label ?? null,
    explanation: card.explanation,
    firstAttemptCorrect: card.firstAttemptCorrect,
    timedOut: card.scoreOutcome === "timeout",
    awardedScore: card.awardedScore,
    attemptCount: card.attemptCount,
  };
}

export function latestReveal(run: DcRun): DcRevealView | null {
  const card = lastResolvedCard(run);
  return card ? projectReveal(card) : null;
}

/** The card the arena is showing: the current one, else the last resolved. */
export function surfaceCard(run: DcRun): DcCard | null {
  return currentCard(run) ?? lastResolvedCard(run);
}

/** Narrowing helper for callers that must not read an answer field. */
export function asUnresolved(card: DcCard | null): DcUnresolvedCard | null {
  return card && card.resolved === false ? card : null;
}
