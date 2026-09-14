/**
 * THE MOGZY MATCH REPORT — a few sentences, derived and never written.
 *
 * "Champion Mastery was your strongest area. Item Builds cost you the most
 * points." A player reads that and knows what to do next, which is the whole
 * difference between a scoreboard and a study product.
 *
 * DETERMINISTIC. NOT GENERATED.
 * ─────────────────────────────
 * Same input, same sentences, every time, with no model in the loop and no
 * network call. Everything below is a fold over the timeline the mode already
 * put on screen, so the report can never claim something the timeline does not
 * show — and a reader who disagrees with a sentence can check it against the
 * strip immediately above it.
 *
 * WHAT IT REFUSES TO SAY
 * ──────────────────────
 * * A "strongest area" needs a real contest: at least two subjects, at least
 *   two entries in the winning subject, and a subject that actually differs
 *   from the weakest one. One perfect subject out of one is not a strength.
 * * A "cost you" line needs a subject that was actually missed.
 * * Nothing is said about speed, percentile, or how other players did. None of
 *   those are measured, so none of them are claimed.
 *
 * The result is often one sentence, and sometimes none at all. That is the
 * correct output for a match with nothing worth reporting.
 */
import type { ResultTimelineEntry } from "./model";

export interface MatchReportInput {
  entries: readonly ResultTimelineEntry[];
  /** Rounds that ran out of time. Stated only when the mode counts them. */
  timeoutCount?: number | null;
  /** New questions this game added to the collection, when the mode has any. */
  discoveredCount?: number | null;
}

export interface Bucket {
  label: string;
  correct: number;
  total: number;
  /** Points LOST is not knowable; points EARNED is. See `lostPoints` below. */
  earned: number;
  missed: number;
}

/** Group the timeline by subject. Insertion order is play order, which is the
 *  tiebreak we want: the earlier subject wins a tie, so the sentence is stable
 *  rather than dependent on object key ordering. */
export function bucketTimeline(entries: readonly ResultTimelineEntry[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const e of entries) {
    const label = e.label.trim();
    if (!label) continue;
    const b = map.get(label)
      ?? { label, correct: 0, total: 0, earned: 0, missed: 0 };
    b.total += 1;
    if (e.outcome === "correct") b.correct += 1;
    else b.missed += 1;
    if (typeof e.points === "number") b.earned += e.points;
    map.set(label, b);
  }
  return Array.from(map.values());
}

const accuracy = (b: Bucket) => (b.total > 0 ? b.correct / b.total : 0);

/**
 * The strongest subject, or null when the match does not support the claim.
 *
 * EXPORTED, and the only implementation. The result screen's "Strongest" tile
 * and this report's first sentence are the same claim in two places, and the
 * one way they can never disagree — including on a TIE, where the tiebreaks
 * below are the whole of the difference — is to come from one function. They
 * did diverge once: a match where two subjects both went 0-for-something put
 * one subject in the tile and the other in the sentence.
 *
 * `minEntries` is the honesty gate: a subject the player met once and got
 * right is not evidence of a strength, and calling it one is the exact
 * flattery this report exists to avoid.
 */
export function strongestBucket(buckets: Bucket[], minEntries = 2): Bucket | null {
  const eligible = buckets.filter((b) => b.total >= minEntries && b.correct > 0);
  if (eligible.length === 0) return null;
  let best = eligible[0];
  for (const b of eligible.slice(1)) {
    if (accuracy(b) > accuracy(best)) best = b;
  }
  return accuracy(best) > 0 ? best : null;
}

/** The subject that went worst, or null when nothing was missed. */
export function weakestBucket(buckets: Bucket[]): Bucket | null {
  const eligible = buckets.filter((b) => b.missed > 0);
  if (eligible.length === 0) return null;
  let worst = eligible[0];
  for (const b of eligible.slice(1)) {
    // Fewest correct per attempt first; more misses breaks a tie, because the
    // subject that took more from the player is the one to name.
    if (accuracy(b) < accuracy(worst)
      || (accuracy(b) === accuracy(worst) && b.missed > worst.missed)) {
      worst = b;
    }
  }
  return worst;
}

export function buildMatchReport(input: MatchReportInput): string[] {
  const { entries, timeoutCount, discoveredCount } = input;
  const lines: string[] = [];
  const buckets = bucketTimeline(entries);
  if (buckets.length === 0) return lines;

  const strongest = strongestBucket(buckets);
  const weakest = weakestBucket(buckets);
  const contested = buckets.length > 1;

  // A perfect game has no weakest subject, and saying so is the point.
  if (weakest === null) {
    if (entries.length > 0) {
      lines.push(`Clean sheet — every ${entries.length === 1 ? "question" : "question"} answered correctly.`);
    }
  } else {
    // The two sentences are only a PAIR when they name different subjects. One
    // subject that is both the best and the worst is just "the subject".
    if (strongest && contested && strongest.label !== weakest.label) {
      lines.push(
        `${strongest.label} was your strongest area — ${strongest.correct} of ${strongest.total}.`,
      );
    }
    const cost = weakest.missed === 1
      ? `one ${weakest.label} question got away from you.`
      : `${weakest.label} cost you the most — ${weakest.missed} missed.`;
    lines.push(weakest.missed === 1 ? cost.charAt(0).toUpperCase() + cost.slice(1) : cost);
  }

  // Stated only when the mode COUNTS timeouts (null = it does not measure
  // them, which is different from measuring zero).
  if (typeof timeoutCount === "number" && timeoutCount > 0) {
    lines.push(
      timeoutCount === 1
        ? "One question ran out of time — answering sooner is free points."
        : `${timeoutCount} questions ran out of time — answering sooner is free points.`,
    );
  }

  if (typeof discoveredCount === "number" && discoveredCount > 0) {
    lines.push(
      discoveredCount === 1
        ? "One new question joined your collection."
        : `${discoveredCount} new questions joined your collection.`,
    );
  }

  return lines;
}
