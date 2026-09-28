/**
 * HUB5 — the Owned collection, DERIVED from every Ranked round the account
 * actually submitted: its ordinary Ranked matches AND its Daily stages' child
 * matches (a Daily stage is an unrated Bot Ranked match, and its rounds are
 * discovered exactly like any other).
 *
 * The rule is the backend's (`ranked_public/discovery.py`): a question is
 * discovered only when a single-answer round carrying a canonical ref is
 * SUBMITTED. A round that was never answered (a sealed forfeit round, a
 * timed-out Time Trial question) discovers nothing, and neither do Meta Reflex
 * blocks or Mastery slices, which reach the ledger through another path.
 * Later encounters of the same ref increment the one entry; its first-seen
 * pointer never moves.
 *
 * One ref, one entry, whichever surfaces asked it — so a repeated learning
 * identity can never produce two contradictory ownership states.
 */
import type { MatchReviewView, QuestionLibraryEntryView, QuestionLibrarySummaryView } from "@/lib/ranked-public/contracts";
import { identityOf, quizContentOf } from "./history/questionIdentity";

export interface LobbyPreviewLibrary {
  summary: QuestionLibrarySummaryView;
  entries: readonly QuestionLibraryEntryView[];
}

/** One played match: when it finished, and its frozen review. */
export interface PlayedMatch {
  completedAt: string;
  review: MatchReviewView;
}

export function deriveLibrary(matches: readonly PlayedMatch[]): LobbyPreviewLibrary {
  type Acc = {
    ref: string; answered: number; correct: number;
    first: string; last: string; firstMatchId: string; firstRoundNumber: number;
  };
  const byRef = new Map<string, Acc>();
  const chronological = matches.slice().sort((a, b) =>
    a.completedAt.localeCompare(b.completedAt) || a.review.matchId.localeCompare(b.review.matchId));
  for (const { completedAt, review } of chronological) {
    for (const round of review.rounds) {
      if (round.kind !== "quiz" || !round.canonicalQuestionRef) continue;
      if (round.viewerSubmission.answerIndex === null) continue; // never submitted
      const ref = round.canonicalQuestionRef;
      identityOf(ref); // every discovered ref is a factory identity
      const correct = round.viewerSubmission.isCorrect === true ? 1 : 0;
      const acc = byRef.get(ref);
      if (!acc) {
        byRef.set(ref, {
          ref, answered: 1, correct, first: completedAt, last: completedAt,
          firstMatchId: review.matchId, firstRoundNumber: round.roundNumber,
        });
      } else {
        acc.answered += 1;
        acc.correct += correct;
        acc.last = completedAt;
      }
    }
  }
  const entries: QuestionLibraryEntryView[] = [...byRef.values()]
    // The API's one ordering: most recently encountered first.
    .sort((a, b) => b.last.localeCompare(a.last) || a.ref.localeCompare(b.ref))
    .map((a) => ({
      canonicalQuestionRef: a.ref,
      firstSeenAt: a.first,
      lastSeenAt: a.last,
      timesAnswered: a.answered,
      timesCorrect: a.correct,
      accuracy: a.answered ? a.correct / a.answered : null,
      firstMatchId: a.firstMatchId,
      firstRoundNumber: a.firstRoundNumber,
      metadataStatus: "resolved",
      metadataSource: "frozen_round",
      question: { prompt: quizContentOf(a.ref).prompt, category: identityOf(a.ref).category },
    }));
  const totalAnswered = entries.reduce((n, e) => n + e.timesAnswered, 0);
  const totalCorrect = entries.reduce((n, e) => n + e.timesCorrect, 0);
  return {
    summary: {
      uniqueDiscovered: entries.length,
      totalAnswered,
      totalCorrect,
      accuracy: totalAnswered ? totalCorrect / totalAnswered : null,
    },
    entries: Object.freeze(entries),
  };
}
