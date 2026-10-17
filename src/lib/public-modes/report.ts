/**
 * PGM1 — THE PER-MODE REPORT AND TELEMETRY CONTRACTS.
 *
 * REPORTS. A public mode files question reports through the existing FB1
 * machinery: it publishes a `ReportableQuestionSnapshot` with
 * `usePublishReportableQuestion`, and the one report control (QuestionReport
 * Scroll, in the Mogzy dock) does the rest. `publicModeReportSnapshot` is the
 * builder every mode uses, so each report carries the mode's stable
 * `game_mode_id` and the catalog's title. The answer and its evidence are
 * passed as a `reveal` that the builder honours ONLY when `revealed` is true:
 * a mode cannot leak an unrevealed answer into a report by forgetting a check.
 *
 * TELEMETRY. More Challenges emits two product events, both keyed by the
 * public id so a later dashboard can count per mode without a mapping table:
 * `more_challenges_viewed` (the catalog was shown, with where it was opened
 * from) and `more_challenges_mode_selected` (a card's action was pressed).
 * Gameplay events stay the modes' own; nothing is re-emitted under these names.
 */
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";
import type { PublicModeEntry, PublicModeId } from "./contracts";
import type { MoreChallengesSource } from "./launch";

/** The feedback area public-mode reports are filed under (an existing category). */
export const PUBLIC_MODE_FEEDBACK_CATEGORY = "Leaguecraft" as const;

export interface PublicModeQuestion {
  runtimeQuestionId?: string | null;
  prompt?: string | null;
  choices?: readonly string[] | null;
  selectedAnswer?: string | null;
  questionType?: string | null;
  moduleType?: string | null;
  matchId?: string | null;
  sessionId?: string | null;
  roundNumber?: number | null;
}

export type PublicModeReveal =
  | { revealed: false }
  | { revealed: true; canonicalAnswer: string | null; evidence?: string | null };

export function publicModeReportSnapshot(
  entry: Pick<PublicModeEntry, "reportId" | "title">,
  question: PublicModeQuestion,
  reveal: PublicModeReveal,
): ReportableQuestionSnapshot {
  return {
    category: PUBLIC_MODE_FEEDBACK_CATEGORY,
    mode: entry.title,
    gameModeId: entry.reportId,
    ...question,
    canonicalAnswer: reveal.revealed ? reveal.canonicalAnswer : null,
    answerEvidence: reveal.revealed ? reveal.evidence ?? null : null,
  };
}

export const MORE_CHALLENGES_VIEWED = "more_challenges_viewed" as const;
export const MORE_CHALLENGES_MODE_SELECTED = "more_challenges_mode_selected" as const;

export function modeSelectedMetadata(id: PublicModeId, action: "play" | "rules", source: MoreChallengesSource) {
  return { game_mode_id: id, action, source };
}
