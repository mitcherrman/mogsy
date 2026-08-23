/**
 * Daily Challenge presentation projections (DC1 Phase 5).
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
 */

import type {
  AnswerOptionView,
  QuestionView,
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

// ── question + options ─────────────────────────────────────────────────────

/**
 * The card as the canonical arena's `QuestionView`.
 *
 * Option ids are the BACKEND INDEX stringified, and stay so even for an
 * eliminated option — the whole point of the backend marking rather than
 * removing them is that index 2 keeps meaning index 2. Renumbering here would
 * make the next submission mean something the server did not intend.
 */
export function projectQuestion(card: DcCard): QuestionView {
  return {
    questionId: `${card.sequence}`,
    prompt: card.prompt,
    category: card.category,
    options: card.options.map((option): AnswerOptionView => ({
      id: String(option.index),
      index: option.index,
      // A Meta Reflex recognition side has no label: its prompt names the
      // target, so a label would be the answer. The art carries the option.
      label: option.label ?? "",
      media: null,
    })),
  };
}

/** Positional option art (an asset path), or null when this card has none. */
export function projectOptionMedia(card: DcCard): (string | null)[] | null {
  return card.options.some((o) => o.media)
    ? card.options.map((o) => o.media ?? null)
    : null;
}

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

export const BEAT_COPY: Record<DcBeatKind, { title: string; detail: string }> = {
  first_correct: { title: "Solved first try", detail: "Scored." },
  // Says what it COST and what to do next, in that order, and never that the
  // player failed: the card is still winnable, just not for points.
  first_miss: { title: "Missed for score", detail: "Keep solving — it still counts as learned." },
  learning_miss: { title: "Not that one", detail: "Try another." },
  learned: { title: "Learned", detail: "Solved after the scored attempt." },
  reflex_timeout: { title: "Time", detail: "The window closed — solve it untimed." },
};

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
  /** Most recent first, oldest last — a compact record of the day so far. */
  record: DcRecordMark[];
}

export type DcRecordMark = "correct" | "learned" | "timeout";

export function projectPlayer(run: DcRun): DcPlayerView {
  const s = run.summary;
  const record: DcRecordMark[] = run.cards
    .filter((c): c is DcResolvedCard => c.resolved === true)
    .sort((a, b) => a.sequence - b.sequence)
    .map((c) => (c.firstAttemptCorrect ? "correct"
      : c.scoreOutcome === "timeout" ? "timeout" : "learned"));
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
    record,
  };
}

// ── timeline ───────────────────────────────────────────────────────────────

export type DcNodeState = "correct" | "learned" | "timeout" | "active" | "future";

export interface DcTimelineNode {
  sequence: number;
  state: DcNodeState;
  /** null when the day's shape is not known (see `projectTimeline`). */
  kind: "quiz" | "meta_reflex" | null;
  /** First and last positions of a Meta Reflex block, for the bracket. */
  blockStart: boolean;
  blockEnd: boolean;
}

/**
 * One node per card of THIS run, in play order.
 *
 * The length comes from the run's own `card_count`, never from a constant: a
 * Daily is 11–15 cards and the plan is the server's. `structure` is the
 * per-position kind from `GET /today` and is optional — it is a fact about
 * TODAY's challenge version, and a run resumed across a regeneration plays an
 * older version whose shape that structure does not describe. When the
 * versions disagree the kinds are dropped rather than guessed, and the strip
 * still renders every position honestly.
 *
 * A future node carries its POSITION and, at most, its kind. Never a prompt,
 * an option, a category or a difficulty — the run projection does not ship
 * unreached cards at all, and this must not reintroduce them.
 */
export function projectTimeline(
  run: DcRun,
  structure: DcStructureEntry[] | null,
  structureVersion: number | null,
): DcTimelineNode[] {
  const usable = structure && structureVersion === run.challengeVersion
    ? new Map(structure.map((e) => [e.sequence, e.kind]))
    : null;

  const bySequence = new Map(run.cards.map((c) => [c.sequence, c]));
  const nodes: DcTimelineNode[] = [];
  for (let sequence = 1; sequence <= run.cardCount; sequence += 1) {
    const card = bySequence.get(sequence) ?? null;
    let state: DcNodeState = "future";
    if (card && card.resolved) {
      state = card.firstAttemptCorrect ? "correct"
        : card.scoreOutcome === "timeout" ? "timeout" : "learned";
    } else if (sequence === run.currentSequence) {
      state = "active";
    }
    nodes.push({
      sequence,
      state,
      kind: usable?.get(sequence) ?? null,
      blockStart: false,
      blockEnd: false,
    });
  }
  // Bracket each contiguous Meta Reflex run so the block reads as one object
  // rather than five adjacent nodes that happen to share a colour.
  nodes.forEach((node, i) => {
    if (node.kind !== "meta_reflex") return;
    node.blockStart = nodes[i - 1]?.kind !== "meta_reflex";
    node.blockEnd = nodes[i + 1]?.kind !== "meta_reflex";
  });
  return nodes;
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
